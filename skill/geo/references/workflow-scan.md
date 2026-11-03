# Workflow: scan

1. Identify the framework and how pages render. Read `geo.config.json` if it exists. See `frameworks.md`.
2. Find the important routes from the router, sitemap and navigation. Check shared layouts first. Sample up to 10 representative routes and say so if there are more.
3. Give every rule in `rules.md` one result: Clear, Problem, Can't tell or Not applicable.
4. Calculate the code score from `scoring.md`.
5. Write the report in the format in `report.md`, with "Do these first" ordered by score gain.
6. Run a live check only if the user gives a URL or asks for one: `scripts/geo.sh scan <target> --format json --output .geo/last-scan.json --quiet`. Report it as **Live readiness**, separately from the code score. Never start a server yourself.
