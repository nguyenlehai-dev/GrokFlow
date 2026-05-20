#!/usr/bin/env bash
# install_nginx.sh — host nginx vhost + Let's Encrypt TLS for a
# flowgrok standalone deploy. One-shot bootstrap.
#
# Usage:  sudo bash deploy/install_nginx.sh <domain> <email>
# Example: sudo bash deploy/install_nginx.sh editor.example.com ops@example.com
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run as root (sudo bash $0)" >&2; exit 1
fi

DOMAIN="${1:-}"
EMAIL="${2:-}"
if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
    echo "Usage: $0 <domain> <email>" >&2; exit 1
fi

FRONTEND_PORT="${FRONTEND_HOST_PORT:-5173}"
BACKEND_PORT="${BACKEND_HOST_PORT:-8000}"

# Install nginx + certbot if missing.
command -v nginx >/dev/null || apt-get install -y nginx
command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx

# Create vhost dir for backend-managed configs (VNC map etc.)
install -d -m 755 -o 10001 -g 10001 /etc/nginx/grokflow-vhosts
echo "include /etc/nginx/grokflow-vhosts/*.conf;" > /etc/nginx/conf.d/grokflow-include.conf

# Per-domain vhost.
VHOST="/etc/nginx/sites-available/flowgrok-${DOMAIN//./_}.conf"
cat > "$VHOST" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 25m;

    location ~ ^/(api|openapi.json|docs|redoc|f)(/|\$) {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }

    location ~ ^/vnc/([a-f0-9]+)/(.*)\$ {
        set \$vnc_short \$1;
        set \$vnc_rest  \$2;
        if (\$vnc_upstream = "_none_") {
            return 502 "VNC container not registered yet — retry Auto login.";
        }
        proxy_pass http://\$vnc_upstream:6901/\$vnc_rest\$is_args\$args;
        proxy_http_version 1.1;
        proxy_set_header Host       \$host;
        proxy_set_header Upgrade    \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout  86400s;
        proxy_send_timeout  86400s;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout 86400s;
    }
}
EOF

ln -sf "$VHOST" "/etc/nginx/sites-enabled/$(basename "$VHOST")"
nginx -t
nginx -s reload

# Issue cert.
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

echo
echo "Done. Test:  curl -I https://${DOMAIN}/health"
