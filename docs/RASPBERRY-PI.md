# __NAME__ on a Raspberry Pi behind Caddy

__NAME__ runs as its own service on the home server (`aether`, 192.168.1.203), next to the other
Bracket apps. Each has its own user, data folder and port; Caddy owns 80/443 and routes by name.

| | This app |
|---|---|
| Web page | `https://__SLUG__.home` (Caddy) → port **__PORT__** (plain HTTP on the Pi) |
| Service user | `__SLUG__` |
| Data | `/var/lib/__SLUG__` (`__SLUG__.db`, `settings.json`, `web.json`, `__SLUG__.log`) |
| Commands | `__SLUG__`, `__SLUG__-update` |

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/__GITHUB__/main/server/install.sh -o __SLUG__-install.sh
sudo bash __SLUG__-install.sh
```

Save it under the app's name: every Bracket app ships an `install.sh` with the same flags, and running
another app's copy would configure that app instead. The installer prints which app it is first thing.

Flags: `--port=<n>`, `--auto-update` (nightly at 04:45), `--share=//host/share --folder=Name` to
mount a NAS share at `/mnt/__SLUG__` (only touches `/etc/fstab` once the mount is proven; refuses to
unmount a busy share), `--branch=main` to track a branch instead of releases.

## Caddy, DNS, hosts (the five steps)

1. Install the app on its port (above). Leave the app's own HTTPS switch off: Caddy terminates TLS.
2. Add the site block and reload Caddy. Both schemes are listed so phones without the Caddy root
   certificate can still open the guest pages over plain http:

   ```bash
   sudo tee -a /etc/caddy/Caddyfile >/dev/null <<'EOF'

   http://__SLUG__.home, https://__SLUG__.home {
       tls internal
       encode zstd gzip
       reverse_proxy 127.0.0.1:__PORT__ {
           flush_interval -1
           transport http {
               read_timeout 0
               write_timeout 0
           }
       }
   }
   EOF
   sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
   ```

   `flush_interval -1` keeps the live event stream flowing; the zero timeouts let long downloads finish.
3. UniFi Network → Settings → Policy Table → DNS Records: Host (A) `__SLUG__.home` → `192.168.1.203`.
4. On a PC with NordVPN, add `192.168.1.203  __SLUG__.home` to `C:\Windows\System32\drivers\etc\hosts`
   (elevated editor). Phones use the router's DNS and need nothing.
5. Open `https://__SLUG__.home`, sign in as `admin` with the password the installer asked for.

Behind the proxy every connection reaches the app from 127.0.0.1, so it reads the real client
address from `X-Forwarded-For` and the scheme from `X-Forwarded-Proto`, but only when the connection
itself comes from loopback. The Security page reports "HTTPS: terminated by the reverse proxy".

## Update

```bash
sudo __SLUG__-update
```

Installs the latest verified release and restarts the service. Data in `/var/lib/__SLUG__` is untouched.

## Home Assistant

Settings → Home Assistant shows a read-only status URL with a key. A REST sensor:

```yaml
rest:
  - resource: "https://__SLUG__.home/api/status?key=YOUR_KEY"
    scan_interval: 60
    sensor:
      - name: "__NAME__ status"
        value_template: "{{ value_json.app }}"
```

Notifications can also go to a Home Assistant webhook: Settings → Notifications → Webhook URL
`http://homeassistant.local:8123/api/webhook/__SLUG__`.

## Restore a backup

```bash
sudo systemctl stop __SLUG__
sudo cp <backup>.db /var/lib/__SLUG__/__SLUG__.db
sudo rm -f /var/lib/__SLUG__/__SLUG__.db-wal /var/lib/__SLUG__/__SLUG__.db-shm
sudo chown __SLUG__:__SLUG__ /var/lib/__SLUG__/*
sudo systemctl start __SLUG__
```

## Troubleshooting

- **"No account exists yet"**: `sudo __SLUG__ --set-password`.
- **The page loads but every call fails with 401**: the session cookie is per app name; sign in again.
- **Logs**: `journalctl -u __SLUG__ -f`, or the Log page in the app.
