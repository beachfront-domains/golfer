# golfer

The initial purpose of this repo was to interface with Caddy's built-in API...that API is unwieldy so instead we utilize Deno and Hono to make a basic API that:

- creates `.crt` and `.key` certificate files for a supplied domain
- creates a Caddy config of said domain
- reloads Caddy

## Prerequisites

- Caddy: https://caddyserver.com
- unzip: `brew install unzip` || `apt install unzip -y`
- Deno: `curl -fsSL https://deno.land/install.sh | sh`
  - `export DENO_INSTALL="/root/.deno"`
  - `export PATH="$DENO_INSTALL/bin:$PATH"`
- `.env` file with a strong `TOKEN`

## Production

```sh
deno task start
```

## Development

```sh
deno task dev
```

```sh
# using curl
curl -d '{ "domain": "www.lynk", "ip": "50.116.2.11" }' -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" -X POST http://localhost:3699/api
```
