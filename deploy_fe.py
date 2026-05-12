import paramiko, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.1.16", username="vpsroot", password="123456789", timeout=20)
cmd = (
    "echo 123456789 | sudo -S bash -c '"
    "cd /home/vpsroot/grokflow && "
    "git pull origin homepage && "
    "docker compose restart frontend && "
    "sleep 3 && "
    "docker ps --filter name=grokflow-frontend --format \"{{.Names}}\\t{{.Status}}\""
    "'"
)
stdin, stdout, stderr = c.exec_command(cmd, timeout=120, get_pty=True)
for line in iter(stdout.readline, ""):
    sys.stdout.write(line); sys.stdout.flush()
print("EXIT", stdout.channel.recv_exit_status())
c.close()
