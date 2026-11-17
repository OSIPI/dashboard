#!/bin/sh
set -eu

echo "OSIPY Dashboard: http://127.0.0.1:60014"
exec nginx -g "daemon off;"
