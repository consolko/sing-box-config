#!/bin/sh

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DEFAULT_FIXTURE_UCI="$ROOT_DIR/tests/fixtures/target-profile.uci"
DEFAULT_EXPECTED_JSON="$ROOT_DIR/tests/fixtures/target-profile.json"
FALLBACK_FIXTURE_UCI="$ROOT_DIR/tests/fixtures/fallback-no-outbounds.uci"
FALLBACK_EXPECTED_JSON="$ROOT_DIR/tests/fixtures/fallback-no-outbounds.json"
GENERATOR="${GENERATOR:-/usr/libexec/sing-box-config/generate.uc}"
CONFIG_PATH="/etc/config/sing-box-config"

for cmd in ucode mktemp cp mv rm cat; do
	if ! command -v "$cmd" >/dev/null 2>&1; then
		echo "Missing required command: $cmd" >&2
		exit 1
	fi
done

if [ ! -f "$GENERATOR" ]; then
	echo "Generator not found: $GENERATOR" >&2
	exit 1
fi

TMP_DIR="$(mktemp -d /tmp/singbox-fixture-test.XXXXXX 2>/dev/null || mktemp -d)"
BACKUP=""
RUN_INDEX=0
NORMALIZER="$TMP_DIR/normalize.uc"

cleanup() {
	if [ -n "$BACKUP" ] && [ -f "$BACKUP" ]; then
		mv "$BACKUP" "$CONFIG_PATH"
	else
		rm -f "$CONFIG_PATH"
	fi

	rm -rf "$TMP_DIR"
}

trap cleanup EXIT INT TERM

if [ -f "$CONFIG_PATH" ]; then
	BACKUP="$TMP_DIR/sing-box-config.backup"
	cp "$CONFIG_PATH" "$BACKUP"
fi

cat >"$NORMALIZER" <<'UCODE'
#!/usr/bin/ucode -S

import * as fs from 'fs';

function object_or_empty(value) {
	return (type(value) == 'object') ? value : {};
}

function field(obj, key, fallback) {
	if (type(obj) != 'object' || obj[key] == null)
		return fallback;

	return obj[key];
}

function array_field(obj, key) {
	let value = field(obj, key, []);

	return (type(value) == 'array') ? value : [];
}

function proxy_tls(outbounds) {
	for (let outbound in outbounds) {
		if (type(outbound) == 'object' && outbound.tag == 'proxy')
			return field(outbound, 'tls', null);
	}

	return null;
}

function sort_keys(keys) {
	for (let i = 0; i < length(keys); i++) {
		for (let j = i + 1; j < length(keys); j++) {
			if (keys[i] > keys[j]) {
				let tmp = keys[i];
				keys[i] = keys[j];
				keys[j] = tmp;
			}
		}
	}
}

function canonical(value) {
	if (type(value) == 'array') {
		let out = [];
		for (let item in value)
			push(out, canonical(item));
		return out;
	}

	if (type(value) == 'object') {
		let keys = [];
		let out = {};

		for (let key, item in value)
			push(keys, key);

		sort_keys(keys);

		for (let key in keys)
			out[key] = canonical(value[key]);

		return out;
	}

	return value;
}

let raw = fs.readfile(ARGV[0]);
if (raw == null)
	die('Unable to read JSON: ' + ARGV[0]);

let input = json(raw);
if (type(input) != 'object')
	die('JSON root must be an object: ' + ARGV[0]);

let experimental = object_or_empty(input.experimental);
let dns = object_or_empty(input.dns);
let route = object_or_empty(input.route);
let outbounds = array_field(input, 'outbounds');
let normalized = {
	log: field(input, 'log', null),
	experimental_cache_file: field(experimental, 'cache_file', null),
	experimental_clash_api: field(experimental, 'clash_api', null),
	dns_cache_capacity: field(dns, 'cache_capacity', null),
	dns_servers: array_field(dns, 'servers'),
	dns_rules: array_field(dns, 'rules'),
	inbounds: array_field(input, 'inbounds'),
	outbounds: outbounds,
	proxy_tls: proxy_tls(outbounds),
	route_default_domain_resolver: field(route, 'default_domain_resolver', null),
	route_rules: array_field(route, 'rules'),
	route_rule_set: array_field(route, 'rule_set')
};

printf('%J\n', canonical(normalized));
UCODE

normalize_json() {
	local src="$1"
	local dst="$2"

	ucode "$NORMALIZER" "$src" >"$dst"
}

run_fixture() {
	local fixture_uci="$1"
	local expected_json="$2"
	local actual_json
	local actual_norm
	local actual_text
	local expected_norm
	local expected_text

	if [ ! -f "$fixture_uci" ]; then
		echo "Fixture UCI file not found: $fixture_uci" >&2
		exit 1
	fi

	if [ ! -f "$expected_json" ]; then
		echo "Expected JSON fixture not found: $expected_json" >&2
		exit 1
	fi

	RUN_INDEX=$((RUN_INDEX + 1))
	actual_json="$TMP_DIR/actual.$RUN_INDEX.json"
	actual_norm="$TMP_DIR/actual.$RUN_INDEX.norm.json"
	expected_norm="$TMP_DIR/expected.$RUN_INDEX.norm.json"

	cp "$fixture_uci" "$CONFIG_PATH"
	ucode "$GENERATOR" >"$actual_json"

	normalize_json "$expected_json" "$expected_norm"
	normalize_json "$actual_json" "$actual_norm"
	expected_text="$(cat "$expected_norm")"
	actual_text="$(cat "$actual_norm")"

	if [ "$expected_text" = "$actual_text" ]; then
		echo "Fixture check passed: $fixture_uci"
	else
		echo "Fixture check failed: $fixture_uci" >&2
		echo "Expected normalized JSON:" >&2
		cat "$expected_norm" >&2
		echo "Actual normalized JSON:" >&2
		cat "$actual_norm" >&2
		exit 1
	fi
}

if [ "$#" -gt 0 ]; then
	run_fixture "${1:-$DEFAULT_FIXTURE_UCI}" "${2:-$DEFAULT_EXPECTED_JSON}"
else
	run_fixture "$DEFAULT_FIXTURE_UCI" "$DEFAULT_EXPECTED_JSON"
	run_fixture "$FALLBACK_FIXTURE_UCI" "$FALLBACK_EXPECTED_JSON"
fi
