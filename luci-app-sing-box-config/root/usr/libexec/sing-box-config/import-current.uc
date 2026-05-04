#!/usr/bin/ucode -S

import { cursor } from 'uci';
import * as fs from 'fs';

const CONFIG = 'sing-box-config';
const DEFAULT_SOURCE = '/etc/sing-box/config.json';
const MANAGED_FRAGMENT_SECTION = 'managed_import_extra';
const MANAGED_FRAGMENT_PATH = '/etc/sing-box/fragments/import-managed-extra.json';
let uci = cursor();

function as_bool(value, fallback) {
	if (value == null)
		return fallback;

	if (type(value) == 'boolean')
		return value;

	if (value == 1 || value == '1' || value == 'true' || value == 'yes' || value == 'on')
		return true;

	if (value == 0 || value == '0' || value == 'false' || value == 'no' || value == 'off')
		return false;

	return fallback;
}

function as_string(value, fallback) {
	if (value == null || value == '')
		return fallback;

	return '' + value;
}

function as_list(value) {
	if (value == null)
		return [];

	if (type(value) == 'array')
		return value;

	return [ value ];
}

function as_string_list(value) {
	let out = [];

	for (let item in as_list(value)) {
		if (item == null)
			continue;

		if (type(item) == 'string' && item == '')
			continue;

		push(out, '' + item);
	}

	return out;
}

function to_port_list(value) {
	let out = [];

	for (let item in as_list(value)) {
		if (item == null)
			continue;

		push(out, '' + item);
	}

	return out;
}

function deep_copy(value) {
	if (type(value) == 'array') {
		let out = [];
		for (let item in value)
			push(out, deep_copy(item));
		return out;
	}

	if (type(value) == 'object') {
		let out = {};
		for (let key, item in value)
			out[key] = deep_copy(item);
		return out;
	}

	return value;
}

function clone_without_keys(obj, known) {
	if (type(obj) != 'object')
		return null;

	let out = {};

	for (let key, value in obj) {
		if (known[key] == true)
			continue;
		out[key] = deep_copy(value);
	}

	if (length(out) == 0)
		return null;

	return out;
}

function set_option(section, key, value) {
	if (value == null)
		return;

	if (type(value) == 'string' && value == '')
		return;

	uci.set(CONFIG, section, key, value);
}

function set_flag(section, key, value) {
	uci.set(CONFIG, section, key, value ? '1' : '0');
}

function set_list_option(section, key, value) {
	let list = as_string_list(value);
	if (length(list) == 0)
		return;

	uci.set(CONFIG, section, key, list);
}

function set_extra_json(section, extra) {
	if (type(extra) != 'object' || length(extra) == 0)
		return;

	uci.set(CONFIG, section, 'extra_json', sprintf('%J', extra));
}

function clear_sections(section_type) {
	let names = [];

	uci.foreach(CONFIG, section_type, function(section) {
		push(names, section['.name']);
	});

	for (let name in names)
		uci.delete(CONFIG, name);
}

function new_section(prefix, section_type, index) {
	let name = prefix + '_' + index;
	uci.set(CONFIG, name, section_type);
	return name;
}

function normalize_route_rule(rule, default_outbound) {
	let action = as_string(rule.action, 'route');
	let out = {
		action: 'proxy'
	};

	if (action == 'route') {
		let outbound = as_string(rule.outbound, '');
		if (outbound == '' || outbound == default_outbound) {
			out.action = 'proxy';
		}
		else if (outbound == 'direct') {
			out.action = 'direct';
		}
		else if (outbound == 'block') {
			out.action = 'block';
		}
		else {
			out.action = 'route';
			out.outbound = outbound;
		}
	}
	else if (action == 'reject' || action == 'hijack-dns' || action == 'sniff') {
		out.action = action;
	}
	else {
		out.action = 'custom';
		out.rule_action = action;
		out.outbound = as_string(rule.outbound, '');
	}

	return out;
}

function ensure_managed_fragment(extra_root) {
	uci.delete(CONFIG, MANAGED_FRAGMENT_SECTION);

	if (type(extra_root) != 'object' || length(extra_root) == 0) {
		fs.unlink(MANAGED_FRAGMENT_PATH);
		return;
	}

	if (system('mkdir -p /etc/sing-box/fragments') != 0)
		die('Unable to create /etc/sing-box/fragments');

	if (!fs.writefile(MANAGED_FRAGMENT_PATH, sprintf('%J\n', extra_root)))
		die('Unable to write managed fragment: ' + MANAGED_FRAGMENT_PATH);

	uci.set(CONFIG, MANAGED_FRAGMENT_SECTION, 'json_fragment');
	uci.set(CONFIG, MANAGED_FRAGMENT_SECTION, 'enabled', '1');
	uci.set(CONFIG, MANAGED_FRAGMENT_SECTION, 'label', 'Managed import extras');
	uci.set(CONFIG, MANAGED_FRAGMENT_SECTION, 'order', '10');
	uci.set(CONFIG, MANAGED_FRAGMENT_SECTION, 'path', MANAGED_FRAGMENT_PATH);
}

let source_path = as_string(ARGV[0], DEFAULT_SOURCE);
let raw = fs.readfile(source_path);

if (raw == null)
	die('Unable to read source JSON: ' + source_path);

let input;
try {
	input = json(raw);
}
catch (e) {
	die('Invalid JSON in source file: ' + source_path + ': ' + e);
}

if (type(input) != 'object')
	die('Source JSON must be an object');

if (uci == null)
	die('Unable to initialize UCI cursor');

if (uci.load(CONFIG) == null)
	die('Unable to load UCI config: ' + CONFIG);

let previous_enabled = as_bool(uci.get(CONFIG, 'main', 'enabled'), true);
let previous_clash_api_enabled = as_bool(uci.get(CONFIG, 'main', 'clash_api_enabled'), true);
let previous_clash_api_listen = as_string(uci.get(CONFIG, 'main', 'clash_api_listen'), '127.0.0.1:9090');
let previous_clash_api_secret = as_string(uci.get(CONFIG, 'main', 'clash_api_secret'), '');

uci.delete(CONFIG, 'main');
clear_sections('dns_server');
clear_sections('dns_rule');
clear_sections('inbound');
clear_sections('outbound');
clear_sections('rule_set');
clear_sections('route_rule');
clear_sections('json_fragment');

uci.set(CONFIG, 'main', 'global');
uci.set(CONFIG, 'main', 'enabled', previous_enabled ? '1' : '0');
uci.set(CONFIG, 'main', 'imported_from_config', '1');
uci.set(CONFIG, 'main', 'import_source', source_path);

let known_root = {
	log: true,
	dns: true,
	inbounds: true,
	outbounds: true,
	route: true,
	experimental: true
};
let root_extra = clone_without_keys(input, known_root);
if (root_extra == null)
	root_extra = {};

let log_obj = (type(input.log) == 'object') ? input.log : {};
set_option('main', 'log_level', as_string(log_obj.level, 'info'));
set_flag('main', 'log_timestamp', as_bool(log_obj.timestamp, false));
let extra_log = clone_without_keys(log_obj, { level: true, timestamp: true });
if (extra_log != null)
	root_extra.log = extra_log;

let exp_obj = (type(input.experimental) == 'object') ? input.experimental : {};
let cache_obj = (type(exp_obj.cache_file) == 'object') ? exp_obj.cache_file : {};
set_flag('main', 'experimental_cache_enabled', as_bool(cache_obj.enabled, false));
set_option('main', 'experimental_cache_path', as_string(cache_obj.path, ''));
let extra_cache = clone_without_keys(cache_obj, { enabled: true, path: true });
let clash_obj = (type(exp_obj.clash_api) == 'object') ? exp_obj.clash_api : {};
let clash_controller = as_string(clash_obj.external_controller, '');
if (clash_controller != '') {
	set_flag('main', 'clash_api_enabled', true);
	set_option('main', 'clash_api_listen', clash_controller);
	set_option('main', 'clash_api_secret', as_string(clash_obj.secret, ''));
}
else {
	set_flag('main', 'clash_api_enabled', previous_clash_api_enabled);
	set_option('main', 'clash_api_listen', previous_clash_api_listen);
	set_option('main', 'clash_api_secret', previous_clash_api_secret);
}
let extra_clash = clone_without_keys(clash_obj, { external_controller: true, secret: true });
let extra_exp = clone_without_keys(exp_obj, { cache_file: true, clash_api: true });
if (extra_cache != null) {
	if (extra_exp == null)
		extra_exp = {};
	extra_exp.cache_file = extra_cache;
}
if (extra_clash != null) {
	if (extra_exp == null)
		extra_exp = {};
	extra_exp.clash_api = extra_clash;
}
if (extra_exp != null)
	root_extra.experimental = extra_exp;

let route_obj = (type(input.route) == 'object') ? input.route : {};
let default_outbound = as_string(route_obj.final, as_string(input.final, 'proxy'));
set_option('main', 'default_outbound', default_outbound);
set_flag('main', 'route_auto_detect_interface', as_bool(route_obj.auto_detect_interface, true));
if (type(route_obj.default_domain_resolver) == 'object')
	set_option('main', 'route_default_domain_resolver_server', as_string(route_obj.default_domain_resolver.server, ''));
let extra_ddr = (type(route_obj.default_domain_resolver) == 'object')
	? clone_without_keys(route_obj.default_domain_resolver, { server: true })
	: null;
let extra_route = clone_without_keys(route_obj, {
	auto_detect_interface: true,
	final: true,
	rules: true,
	rule_set: true,
	default_domain_resolver: true
});
if (extra_ddr != null) {
	if (extra_route == null)
		extra_route = {};
	extra_route.default_domain_resolver = extra_ddr;
}
if (extra_route != null)
	root_extra.route = extra_route;

let dns_obj = (type(input.dns) == 'object') ? input.dns : null;
set_flag('main', 'dns_enable', dns_obj != null);
if (dns_obj != null) {
	set_option('main', 'dns_strategy', as_string(dns_obj.strategy, ''));
	set_option('main', 'dns_final', as_string(dns_obj.final, ''));
	set_option('main', 'dns_cache_capacity', as_string(dns_obj.cache_capacity, ''));
}
set_flag('main', 'dns_hijack_lan', false);
let extra_dns = (dns_obj != null) ? clone_without_keys(dns_obj, {
	servers: true,
	rules: true,
	strategy: true,
	final: true,
	cache_capacity: true
}) : null;
if (extra_dns != null)
	root_extra.dns = extra_dns;

let inbounds = as_list(input.inbounds);
set_flag('main', 'tun_enable', false);

let outbounds = as_list(input.outbounds);
for (let idx, outbound in outbounds) {
	if (type(outbound) != 'object')
		continue;

	let sid = new_section('outbound', 'outbound', idx);
	let tls_obj = (type(outbound.tls) == 'object') ? outbound.tls : null;
	let utls_obj = (tls_obj != null && type(tls_obj.utls) == 'object') ? tls_obj.utls : null;
	let reality_obj = (tls_obj != null && type(tls_obj.reality) == 'object') ? tls_obj.reality : null;

	set_flag(sid, 'enabled', true);
	set_option(sid, 'label', as_string(outbound.tag, ''));
	set_option(sid, 'tag', as_string(outbound.tag, ''));
	set_option(sid, 'type', as_string(outbound.type, ''));
	set_option(sid, 'server', as_string(outbound.server, ''));
	set_option(sid, 'server_port', as_string(outbound.server_port, ''));
	set_option(sid, 'uuid', as_string(outbound.uuid, ''));
	set_option(sid, 'flow', as_string(outbound.flow, ''));
	set_option(sid, 'password', as_string(outbound.password, ''));
	set_option(sid, 'username', as_string(outbound.username, ''));
	set_option(sid, 'method', as_string(outbound.method, ''));
	set_list_option(sid, 'outbounds', outbound.outbounds);
	set_option(sid, 'interval', as_string(outbound.interval, ''));
	set_option(sid, 'tolerance', as_string(outbound.tolerance, ''));
	set_list_option(sid, 'network', outbound.network);

	if (tls_obj != null) {
		set_flag(sid, 'tls_enabled', as_bool(tls_obj.enabled, true));
		set_option(sid, 'tls_server_name', as_string(tls_obj.server_name, ''));
		set_flag(sid, 'tls_insecure', as_bool(tls_obj.insecure, false));
		set_list_option(sid, 'tls_alpn', tls_obj.alpn);
	}

	if (utls_obj != null) {
		set_flag(sid, 'tls_utls_enabled', as_bool(utls_obj.enabled, true));
		set_option(sid, 'tls_utls_fingerprint', as_string(utls_obj.fingerprint, ''));
	}

	if (reality_obj != null) {
		set_flag(sid, 'tls_reality_enabled', as_bool(reality_obj.enabled, true));
		set_option(sid, 'tls_reality_public_key', as_string(reality_obj.public_key, ''));
		set_option(sid, 'tls_reality_short_id', as_string(reality_obj.short_id, ''));
	}

	let extra_tls = (tls_obj != null) ? clone_without_keys(tls_obj, {
		enabled: true,
		server_name: true,
		insecure: true,
		alpn: true,
		utls: true,
		reality: true
	}) : null;
	let extra_utls = (utls_obj != null) ? clone_without_keys(utls_obj, {
		enabled: true,
		fingerprint: true
	}) : null;
	let extra_reality = (reality_obj != null) ? clone_without_keys(reality_obj, {
		enabled: true,
		public_key: true,
		short_id: true
	}) : null;
	if (extra_utls != null || extra_reality != null || extra_tls != null) {
		if (extra_tls == null)
			extra_tls = {};
		if (extra_utls != null)
			extra_tls.utls = extra_utls;
		if (extra_reality != null)
			extra_tls.reality = extra_reality;
	}

	let extra_outbound = clone_without_keys(outbound, {
		type: true,
		tag: true,
		server: true,
		server_port: true,
		uuid: true,
		flow: true,
		password: true,
		username: true,
		method: true,
		outbounds: true,
		interval: true,
		tolerance: true,
		network: true,
		tls: true
	});
	if (extra_tls != null) {
		if (extra_outbound == null)
			extra_outbound = {};
		extra_outbound.tls = extra_tls;
	}

	set_extra_json(sid, extra_outbound);
}

for (let idx, inbound in inbounds) {
	if (type(inbound) != 'object')
		continue;

	let sid = new_section('inbound', 'inbound', idx);
	let inbound_type = as_string(inbound.type, '');

	set_flag(sid, 'enabled', true);
	set_option(sid, 'label', as_string(inbound.tag, ''));
	set_option(sid, 'tag', as_string(inbound.tag, ''));
	set_option(sid, 'type', inbound_type);

	if (inbound_type == 'tun') {
		set_option(sid, 'interface_name', as_string(inbound.interface_name, ''));
		set_list_option(sid, 'address', inbound.address);
		set_option(sid, 'mtu', as_string(inbound.mtu, ''));
		set_flag(sid, 'auto_route', as_bool(inbound.auto_route, false));
		set_flag(sid, 'strict_route', as_bool(inbound.strict_route, false));
		set_option(sid, 'stack', as_string(inbound.stack, ''));
	}

	if (inbound_type == 'direct') {
		set_option(sid, 'listen', as_string(inbound.listen, ''));
		set_option(sid, 'listen_port', as_string(inbound.listen_port, ''));
	}

	set_extra_json(sid, clone_without_keys(inbound, {
		type: true,
		tag: true,
		interface_name: true,
		address: true,
		mtu: true,
		auto_route: true,
		strict_route: true,
		stack: true,
		listen: true,
		listen_port: true
	}));
}

if (length(inbounds) > 0) {
	let first_tun = null;
	for (let item in inbounds) {
		if (type(item) == 'object' && as_string(item.type, '') == 'tun') {
			first_tun = item;
			break;
		}
	}

	if (first_tun != null) {
		set_flag('main', 'tun_enable', true);
		set_option('main', 'tun_interface_name', as_string(first_tun.interface_name, 'tun0'));
		set_option('main', 'tun_tag', as_string(first_tun.tag, 'tun-in'));
		set_option('main', 'tun_stack', as_string(first_tun.stack, 'system'));
		set_option('main', 'tun_mtu', as_string(first_tun.mtu, '1500'));
		set_flag('main', 'tun_auto_route', as_bool(first_tun.auto_route, true));
		set_flag('main', 'tun_strict_route', as_bool(first_tun.strict_route, false));
		set_list_option('main', 'tun_address', first_tun.address);
	}
}

let servers = (dns_obj != null) ? as_list(dns_obj.servers) : [];
for (let idx, server in servers) {
	if (type(server) != 'object')
		continue;

	let sid = new_section('dns_server', 'dns_server', idx);
	let server_tls = (type(server.tls) == 'object') ? server.tls : null;

	set_flag(sid, 'enabled', true);
	set_option(sid, 'label', as_string(server.tag, ''));
	set_option(sid, 'tag', as_string(server.tag, ''));
	set_option(sid, 'type', as_string(server.type, ''));
	set_option(sid, 'server', as_string(server.server, ''));
	set_option(sid, 'server_port', as_string(server.server_port, ''));
	set_option(sid, 'path', as_string(server.path, ''));
	set_option(sid, 'detour', as_string(server.detour, ''));
	set_option(sid, 'strategy', as_string(server.strategy, ''));
	set_option(sid, 'client_subnet', as_string(server.client_subnet, ''));
	set_option(sid, 'address', as_string(server.address, ''));
	set_option(sid, 'address_resolver', as_string(server.address_resolver, ''));
	set_option(sid, 'address_strategy', as_string(server.address_strategy, ''));
	set_flag(sid, 'insecure', as_bool(server.insecure, false) || as_bool((server_tls != null) ? server_tls.insecure : null, false));

	let extra_server_tls = (server_tls != null) ? clone_without_keys(server_tls, { insecure: true }) : null;
	let extra_server = clone_without_keys(server, {
		tag: true,
		type: true,
		server: true,
		server_port: true,
		path: true,
		detour: true,
		strategy: true,
		client_subnet: true,
		address: true,
		address_resolver: true,
		address_strategy: true,
		insecure: true,
		tls: true
	});
	if (extra_server_tls != null) {
		if (extra_server == null)
			extra_server = {};
		extra_server.tls = extra_server_tls;
	}

	set_extra_json(sid, extra_server);
}

let dns_rules = (dns_obj != null) ? as_list(dns_obj.rules) : [];
for (let idx, rule in dns_rules) {
	if (type(rule) != 'object')
		continue;

	let sid = new_section('dns_rule', 'dns_rule', idx);
	set_flag(sid, 'enabled', true);
	set_option(sid, 'label', as_string(rule.label, sprintf('dns-rule-%d', idx + 1)));
	set_option(sid, 'action', as_string(rule.action, 'route'));
	set_option(sid, 'server', as_string(rule.server, ''));
	set_flag(sid, 'disable_cache', as_bool(rule.disable_cache, false));
	set_flag(sid, 'invert', as_bool(rule.invert, false));
	set_list_option(sid, 'domain', rule.domain);
	set_list_option(sid, 'domain_suffix', rule.domain_suffix);
	set_list_option(sid, 'domain_keyword', rule.domain_keyword);
	set_list_option(sid, 'inbound', rule.inbound);
	set_list_option(sid, 'ip_cidr', rule.ip_cidr);
	set_list_option(sid, 'source_ip_cidr', rule.source_ip_cidr);
	set_list_option(sid, 'rule_set', rule.rule_set);
	set_list_option(sid, 'process_name', rule.process_name);
	set_list_option(sid, 'package_name', rule.package_name);
	set_list_option(sid, 'source_mac_address', rule.source_mac_address);
	set_list_option(sid, 'source_hostname', rule.source_hostname);
	set_list_option(sid, 'port', to_port_list(rule.port));
	set_list_option(sid, 'source_port', to_port_list(rule.source_port));
	set_flag(sid, 'ip_is_private', as_bool(rule.ip_is_private, false));
	set_flag(sid, 'source_ip_is_private', as_bool(rule.source_ip_is_private, false));

	set_extra_json(sid, clone_without_keys(rule, {
		label: true,
		action: true,
		server: true,
		disable_cache: true,
		invert: true,
		domain: true,
		domain_suffix: true,
		domain_keyword: true,
		inbound: true,
		ip_cidr: true,
		source_ip_cidr: true,
		rule_set: true,
		process_name: true,
		package_name: true,
		source_mac_address: true,
		source_hostname: true,
		port: true,
		source_port: true,
		ip_is_private: true,
		source_ip_is_private: true
	}));
}

let rule_set_items = as_list(route_obj.rule_set);
for (let idx, rule_set in rule_set_items) {
	if (type(rule_set) != 'object')
		continue;

	let sid = new_section('rule_set', 'rule_set', idx);
	set_flag(sid, 'enabled', true);
	set_option(sid, 'label', as_string(rule_set.tag, ''));
	set_option(sid, 'tag', as_string(rule_set.tag, ''));
	set_option(sid, 'type', as_string(rule_set.type, ''));
	set_option(sid, 'format', as_string(rule_set.format, ''));
	set_option(sid, 'url', as_string(rule_set.url, ''));
	set_option(sid, 'path', as_string(rule_set.path, ''));
	set_option(sid, 'download_detour', as_string(rule_set.download_detour, ''));
	set_option(sid, 'update_interval', as_string(rule_set.update_interval, ''));

	set_extra_json(sid, clone_without_keys(rule_set, {
		tag: true,
		type: true,
		format: true,
		url: true,
		path: true,
		download_detour: true,
		update_interval: true
	}));
}

let route_rules = as_list(route_obj.rules);
for (let idx, rule in route_rules) {
	if (type(rule) != 'object')
		continue;

	let sid = new_section('route_rule', 'route_rule', idx);
	let normalized = normalize_route_rule(rule, default_outbound);

	set_flag(sid, 'enabled', true);
	set_option(sid, 'label', as_string(rule.label, sprintf('route-rule-%d', idx + 1)));
	set_option(sid, 'action', normalized.action);
	set_option(sid, 'outbound', as_string(normalized.outbound, ''));
	set_option(sid, 'rule_action', as_string(normalized.rule_action, ''));
	set_flag(sid, 'invert', as_bool(rule.invert, false));
	set_list_option(sid, 'domain', rule.domain);
	set_list_option(sid, 'domain_suffix', rule.domain_suffix);
	set_list_option(sid, 'domain_keyword', rule.domain_keyword);
	set_list_option(sid, 'inbound', rule.inbound);
	set_list_option(sid, 'ip_cidr', rule.ip_cidr);
	set_list_option(sid, 'source_ip_cidr', rule.source_ip_cidr);
	set_flag(sid, 'ip_is_private', as_bool(rule.ip_is_private, false));
	set_flag(sid, 'source_ip_is_private', as_bool(rule.source_ip_is_private, false));
	set_list_option(sid, 'port', to_port_list(rule.port));
	set_list_option(sid, 'source_port', to_port_list(rule.source_port));
	set_list_option(sid, 'protocol', rule.protocol);
	set_list_option(sid, 'network', rule.network);
	set_list_option(sid, 'sniffer', rule.sniffer);
	set_list_option(sid, 'process_name', rule.process_name);
	set_list_option(sid, 'package_name', rule.package_name);
	set_list_option(sid, 'rule_set', rule.rule_set);
	set_list_option(sid, 'source_mac_address', rule.source_mac_address);
	set_list_option(sid, 'source_hostname', rule.source_hostname);

	set_extra_json(sid, clone_without_keys(rule, {
		label: true,
		action: true,
		outbound: true,
		invert: true,
		domain: true,
		domain_suffix: true,
		domain_keyword: true,
		inbound: true,
		ip_cidr: true,
		source_ip_cidr: true,
		ip_is_private: true,
		source_ip_is_private: true,
		port: true,
		source_port: true,
		protocol: true,
		network: true,
		sniffer: true,
		process_name: true,
		package_name: true,
		rule_set: true,
		source_mac_address: true,
		source_hostname: true
	}));
}

ensure_managed_fragment(root_extra);

uci.commit(CONFIG);

printf('Imported %s into %s\n', source_path, CONFIG);
