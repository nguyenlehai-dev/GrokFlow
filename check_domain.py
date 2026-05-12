import paramiko, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.1.16", username="vpsroot", password="123456789", timeout=20)
cmd = (
    "echo 123456789 | sudo -S bash -c '"
    "cd /home/vpsroot/grokflow && "
    "git pull origin homepage && "
    "echo ---PROMOTE---; "
    "docker exec grokflow-postgres-1 psql -U grokflow -d grokflow "
    '-c "UPDATE users SET role=' "'admin'" ' WHERE email=' "'admin@gmail.com'" ' RETURNING email, role;"'
    "'"
)
stdin, stdout, stderr = c.exec_command(cmd, timeout=60, get_pty=True)
print(stdout.read().decode("utf-8", errors="replace"))
print("STDERR:", stderr.read().decode("utf-8", errors="replace"))
c.close()
