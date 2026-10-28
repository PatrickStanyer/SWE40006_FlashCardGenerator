# Monitoring

Prometheus and Grafana for the counters the backend publishes at `/metrics` on
both deployed environments.

```bash
docker compose -f monitoring/docker-compose.monitoring.yml up -d
```

Prometheus is on <http://localhost:9090>, Grafana on <http://localhost:3000>.
The datasource and the dashboard are provisioned from this folder, so there is
nothing to click through after it starts. Anonymous viewing is on; the admin
login is `admin` / `admin` and is only reachable on the machine running it.

Stop it with `docker compose -f monitoring/docker-compose.monitoring.yml down`.

## Why it does not run on the EC2 host

That instance is a `t3.micro` already carrying four application containers, and
it ran out of disk once during the project. Prometheus scrapes over HTTP, so it
does not have to sit next to the application to see it. Running the collector
wherever someone wants to look keeps the deployment target as small as it was
while still producing the measurements.

The trade-off is that nothing is collecting while nobody is looking, so this is
not continuous monitoring. Moving the collector onto a host of its own is the
step that would make it so, and it is a hosting decision rather than a code
change.

## What the dashboard answers

The service returns a usable deck whether or not the model answered, because a
failed live call falls back to the deterministic generator. That is the right
behaviour and it is also why the failure is invisible: a rejected credential
and an environment that was never given one look identical from outside.

**Share served by the deterministic generator** is the panel that matters.
Production has no key configured and sits at one hundred percent, which is
expected. Staging has a key and sits at zero. Staging climbing towards one
hundred means the live call is failing and nobody has noticed.

**Average time to generate a deck** separates the two paths independently. The
model path runs near two seconds because it leaves the host; the deterministic
path is effectively instant.

**Running version** shows the commit each environment reports, which is the
same value the deployment smoke test asserts against.

Counters live in the process, so they reset when a deployment replaces a
container. The ratio therefore reads per release rather than for all time,
which is usually what you want when asking whether the release currently
serving traffic is healthy.

## Adding a target

Edit the two entries in `prometheus.yml` and restart the stack. The host there
is the address already published in the project README.
