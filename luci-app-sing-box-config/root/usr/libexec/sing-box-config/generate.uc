#!/usr/bin/ucode -S

import { cursor } from 'uci';
import * as fs from 'fs';

const CONFIG = 'sing-box-config';
const META_FIELDS = {
	'.anonymous': true,
	'.index': true,
	'.name': true,
	'.type': true,
	'enabled': true,
	'label': true,
	'extra_json': true
};

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

function as_int(value, fallback) {
	if (value == null || value == '')
		return fallback;

	let n = +value;

	if (n != n)
		return fallback;

	return n;
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

function list_nonempty(value) {
	let out = [];

	for (let item in as_list(value)) {
		let str = as_string(item, '');
		if (str != '')
			push(out, str);
	}

	return out;
}

function list_to_port_values(value) {
	let raw = list_nonempty(value);
	let out = [];

	for (let item in raw) {
		let n = as_int(item, null);
		if (n != null && ('' + n) == item)
			push(out, n);
		else
			push(out, item);
	}

	if (length(out) == 0)
		return null;

	if (length(out) == 1)
		return out[0];

	return out;
}

function clone_value(value) {
	if (type(value) == 'array') {
		let out = [];
		for (let item in value)
			push(out, clone_value(item));
		return out;
	}

	if (type(value) == 'object') {
		let out = {};
		for (let key, item in value)
			out[key] = clone_value(item);
		return out;
	}

	return value;
}

function deep_merge(dst, src) {
	for (let key, value in src) {
		if (dst[key] == null) {
			dst[key] = clone_value(value);
			continue;
		}

		if (type(dst[key]) == 'object' && type(value) == 'object') {
			deep_merge(dst[key], value);
			continue;
		}

		if (type(dst[key]) == 'array' && type(value) == 'array') {
			for (let item in value)
				push(dst[key], clone_value(item));
			continue;
		}

		dst[key] = clone_value(value);
	}
}

function set_when(target, key, value) {
	if (value == null)
		return;

	if (type(value) == 'string' && value == '')
		return;

	if (type(value) == 'array' && length(value) == 0)
		return;

	target[key] = value;
}

function parse_extra_json(raw, context_label) {
	let text = as_string(raw, '');
	if (text == '')
		return null;

	let parsed;
	try {
		parsed = json(text);
	}
	catch (e) {
		die('Invalid extra_json in ' + context_label + ': ' + e);
	}

	if (type(parsed) != 'object')
		die('extra_json must be an object in ' + context_label);

	return parsed;
}

function pick_dynamic_fields(section, options) {
	for (let key, value in section) {
		if (META_FIELDS[key] == true)
			continue;

		if (options.skip[key] == true)
			continue;

		if (value == null)
			continue;

		if (type(value) == 'string' && value == '')
			continue;

		if (options.numeric[key] == true) {
			let n = as_int(value, null);
			if (n != null)
				options.out[key] = n;
			continue;
		}

		if (options.boolean[key] == true) {
			options.out[key] = as_bool(value, false);
			continue;
		}

		if (type(value) == 'array') {
			let arr = list_nonempty(value);
			if (length(arr) > 0)
				options.out[key] = arr;
			continue;
		}

		options.out[key] = value;
	}
}

function build_dns_servers() {
	let servers = [];
	let typed_types = {
		local: true,
		hosts: true,
		tcp: true,
		udp: true,
		tls: true,
		quic: true,
		https: true,
		h3: true,
		dhcp: true,
		fakeip: true,
		tailscale: true,
		resolved: true
	};

	uci.foreach(CONFIG, 'dns_server', function(section) {
		if (!as_bool(section.enabled, true))
			return;

		let server = {};
		let dns_type = as_string(section.type, '');
		let has_typed_fields = (typed_types[dns_type] == true) ||
			(as_string(section.server, '') != '') ||
			(as_string(section.path, '') != '') ||
			(as_int(section.server_port, null) != null);
		let legacy_address = as_string(section.address, '');

		set_when(server, 'tag', as_string(section.tag, ''));

		if (has_typed_fields) {
			set_when(server, 'type', dns_type);
			set_when(server, 'server', as_string(section.server, ''));
			set_when(server, 'path', as_string(section.path, ''));

			let server_port = as_int(section.server_port, null);
			if (server_port != null)
				server.server_port = server_port;

			if ((dns_type == 'tls' || dns_type == 'https' || dns_type == 'h3' || dns_type == 'quic') &&
			    as_bool(section.insecure, false)) {
				server.tls = { insecure: true };
			}
		}
		else if (legacy_address != '') {
			/* Legacy DNS server format kept as compatibility fallback. */
			server.address = legacy_address;
		}

		set_when(server, 'detour', as_string(section.detour, ''));
		set_when(server, 'strategy', as_string(section.strategy, ''));
		set_when(server, 'client_subnet', as_string(section.client_subnet, ''));
		set_when(server, 'address_resolver', as_string(section.address_resolver, ''));
		set_when(server, 'address_strategy', as_string(section.address_strategy, ''));

		if (!has_typed_fields && as_bool(section.insecure, false))
			server.insecure = true;

		if (server.tag != null || server.address != null || server.server != null)
			push(servers, server);

		let extra = parse_extra_json(section.extra_json, 'dns_server ' + as_string(section['.name'], '?'));
		if (extra != null)
			deep_merge(server, extra);
	});

	return servers;
}

function build_dns_rules() {
	let rules = [];
	let list_fields = [
		'inbound',
		'domain',
		'domain_suffix',
		'domain_keyword',
		'ip_cidr',
		'source_ip_cidr',
		'rule_set',
		'source_mac_address',
		'source_hostname',
		'process_name',
		'package_name'
	];

	uci.foreach(CONFIG, 'dns_rule', function(section) {
		if (!as_bool(section.enabled, true))
			return;

		let rule = {
			action: as_string(section.action, 'route')
		};

		for (let field in list_fields) {
			let values = list_nonempty(section[field]);
			if (length(values) > 0)
				rule[field] = values;
		}

		let port = list_to_port_values(section.port);
		if (port != null)
			rule.port = port;

		let source_port = list_to_port_values(section.source_port);
		if (source_port != null)
			rule.source_port = source_port;

		if (as_bool(section.invert, false))
			rule.invert = true;

		if (as_bool(section.ip_is_private, false))
			rule.ip_is_private = true;

		if (as_bool(section.source_ip_is_private, false))
			rule.source_ip_is_private = true;

		set_when(rule, 'server', as_string(section.server, ''));

		if (as_bool(section.disable_cache, false))
			rule.disable_cache = true;

		let extra = parse_extra_json(section.extra_json, 'dns_rule ' + as_string(section['.name'], '?'));
		if (extra != null)
			deep_merge(rule, extra);

		push(rules, rule);
	});

	return rules;
}

function build_outbounds() {
	let outbounds = [];
	let numeric = {
		server_port: true,
		alter_id: true,
		udp_over_tcp_version: true,
		up_mbps: true,
		down_mbps: true,
		interval: true,
		tolerance: true,
		idle_timeout: true
	};
	let boolean = {
		udp_over_tcp: true,
		udp_fragment: true
	};
	let skip = {
		tls_enabled: true,
		tls_server_name: true,
		tls_insecure: true,
		tls_alpn: true,
		tls_utls_enabled: true,
		tls_utls_fingerprint: true,
		tls_reality_enabled: true,
		tls_reality_public_key: true,
		tls_reality_short_id: true
	};

	uci.foreach(CONFIG, 'outbound', function(section) {
		if (!as_bool(section.enabled, true))
			return;

		let outbound = {
			type: as_string(section.type, ''),
			tag: as_string(section.tag, '')
		};

		if (outbound.type == '' || outbound.tag == '')
			return;

		pick_dynamic_fields(section, {
			out: outbound,
			skip: skip,
			numeric: numeric,
			boolean: boolean
		});

			let has_tls = as_bool(section.tls_enabled, false) ||
				(as_string(section.tls_server_name, '') != '') ||
				as_bool(section.tls_insecure, false) ||
				(length(list_nonempty(section.tls_alpn)) > 0) ||
				as_bool(section.tls_utls_enabled, false) ||
				(as_string(section.tls_utls_fingerprint, '') != '') ||
				as_bool(section.tls_reality_enabled, false) ||
				(as_string(section.tls_reality_public_key, '') != '') ||
				(as_string(section.tls_reality_short_id, '') != '');

			if (has_tls) {
				outbound.tls = {
					enabled: as_bool(section.tls_enabled, true)
				};
				set_when(outbound.tls, 'server_name', as_string(section.tls_server_name, ''));
				if (as_bool(section.tls_insecure, false))
					outbound.tls.insecure = true;

				let alpn = list_nonempty(section.tls_alpn);
				if (length(alpn) > 0)
					outbound.tls.alpn = alpn;

				let utls_fingerprint = as_string(section.tls_utls_fingerprint, '');
				if (as_bool(section.tls_utls_enabled, false) || utls_fingerprint != '') {
					outbound.tls.utls = {
						enabled: as_bool(section.tls_utls_enabled, utls_fingerprint != '')
					};
					set_when(outbound.tls.utls, 'fingerprint', utls_fingerprint);
				}

				let reality_public_key = as_string(section.tls_reality_public_key, '');
				let reality_short_id = as_string(section.tls_reality_short_id, '');
				if (as_bool(section.tls_reality_enabled, false) || reality_public_key != '' || reality_short_id != '') {
					outbound.tls.reality = {
						enabled: as_bool(section.tls_reality_enabled, (reality_public_key != '' || reality_short_id != ''))
					};
					set_when(outbound.tls.reality, 'public_key', reality_public_key);
					set_when(outbound.tls.reality, 'short_id', reality_short_id);
				}
			}

		let linked = list_nonempty(section.outbounds);
		if (length(linked) > 0)
			outbound.outbounds = linked;

		let extra = parse_extra_json(section.extra_json, 'outbound ' + as_string(section['.name'], '?'));
		if (extra != null)
			deep_merge(outbound, extra);

		push(outbounds, outbound);
	});

	return outbounds;
}

function build_rule_set() {
	let rule_set = [];
	let numeric = {};
	let boolean = {};
	let skip = {};

	uci.foreach(CONFIG, 'rule_set', function(section) {
		if (!as_bool(section.enabled, true))
			return;

		let item = {
			type: as_string(section.type, 'remote'),
			tag: as_string(section.tag, '')
		};

		if (item.tag == '')
			return;

		pick_dynamic_fields(section, {
			out: item,
			skip: skip,
			numeric: numeric,
			boolean: boolean
		});

		let extra = parse_extra_json(section.extra_json, 'rule_set ' + as_string(section['.name'], '?'));
		if (extra != null)
			deep_merge(item, extra);

		push(rule_set, item);
	});

	return rule_set;
}

function build_route_rules(global_section, default_outbound) {
	let rules = [];
	let list_fields = [
		'inbound',
		'domain',
		'domain_suffix',
		'domain_keyword',
		'ip_cidr',
		'source_ip_cidr',
		'protocol',
		'network',
		'sniffer',
		'process_name',
		'package_name',
		'rule_set',
		'source_mac_address',
		'source_hostname'
	];

	uci.foreach(CONFIG, 'route_rule', function(section) {
		if (!as_bool(section.enabled, true))
			return;

		let rule = {};
		let action = as_string(section.action, 'proxy');
		let outbound = as_string(section.outbound, '');

		for (let field in list_fields) {
			let values = list_nonempty(section[field]);
			if (length(values) > 0)
				rule[field] = values;
		}

		let port = list_to_port_values(section.port);
		if (port != null)
			rule.port = port;

		let source_port = list_to_port_values(section.source_port);
		if (source_port != null)
			rule.source_port = source_port;

		if (as_bool(section.invert, false))
			rule.invert = true;

		if (as_bool(section.ip_is_private, false))
			rule.ip_is_private = true;

		if (as_bool(section.source_ip_is_private, false))
			rule.source_ip_is_private = true;

		if (action == 'block') {
			/* Keep legacy "block" semantic by routing to block outbound. */
			rule.action = 'route';
			rule.outbound = (outbound == '') ? 'block' : outbound;
		}
		else if (action == 'custom') {
			rule.action = as_string(section.rule_action, '');
			set_when(rule, 'outbound', outbound);
			if (rule.action == '') {
				rule.action = 'route';
				rule.outbound = default_outbound;
			}
		}
		else if (action == 'direct') {
			rule.action = 'route';
			rule.outbound = (outbound == '') ? 'direct' : outbound;
		}
		else if (action == 'route') {
			rule.action = 'route';
			rule.outbound = (outbound == '') ? default_outbound : outbound;
		}
		else if (action == 'reject') {
			rule.action = 'reject';
		}
		else if (action == 'hijack-dns') {
			rule.action = 'hijack-dns';
		}
		else if (action == 'sniff') {
			rule.action = 'sniff';
			if (rule.sniffer == null || length(rule.sniffer) == 0)
				rule.sniffer = [ 'http', 'tls', 'quic' ];
		}
		else {
			rule.action = 'route';
			rule.outbound = (outbound == '') ? default_outbound : outbound;
		}

		let extra = parse_extra_json(section.extra_json, 'route_rule ' + as_string(section['.name'], '?'));
		if (extra != null)
			deep_merge(rule, extra);

		push(rules, rule);
	});

	if (as_bool(global_section.dns_enable, true) && as_bool(global_section.dns_hijack_lan, true)) {
		push(rules, {
			action: 'hijack-dns',
			port: 53,
			network: [ 'udp', 'tcp' ]
		});
	}

	return rules;
}

function collect_outbound_tags(cfg) {
	let tags = {};

	for (let outbound in as_list(cfg.outbounds)) {
		if (type(outbound) != 'object')
			continue;

		let tag = as_string(outbound.tag, '');
		if (tag != '')
			tags[tag] = true;
	}

	return tags;
}

function require_outbound_tag(tags, value, context_label) {
	let tag = as_string(value, '');

	if (tag == '')
		return;

	if (tags[tag] != true)
		die('Unknown outbound tag "' + tag + '" in ' + context_label);
}

function require_outbound_tag_list(tags, value, context_label) {
	for (let tag in list_nonempty(value))
		require_outbound_tag(tags, tag, context_label);
}

function validate_outbound_references(cfg) {
	let tags = collect_outbound_tags(cfg);
	let route = (type(cfg.route) == 'object') ? cfg.route : {};
	let dns = (type(cfg.dns) == 'object') ? cfg.dns : {};

	require_outbound_tag(tags, route.final, 'route.final');

	for (let idx, outbound in as_list(cfg.outbounds)) {
		if (type(outbound) != 'object')
			continue;

		let tag = as_string(outbound.tag, 'outbound[' + idx + ']');
		require_outbound_tag(tags, outbound.detour, 'outbound ' + tag + '.detour');
		require_outbound_tag_list(tags, outbound.outbounds, 'outbound ' + tag + '.outbounds');
	}

	for (let idx, server in as_list(dns.servers)) {
		if (type(server) != 'object')
			continue;

		require_outbound_tag(tags, server.detour, 'dns.servers[' + idx + '].detour');
	}

	for (let idx, rule_set in as_list(route.rule_set)) {
		if (type(rule_set) != 'object')
			continue;

		require_outbound_tag(tags, rule_set.download_detour, 'route.rule_set[' + idx + '].download_detour');
	}

	for (let idx, rule in as_list(route.rules)) {
		if (type(rule) != 'object')
			continue;

		require_outbound_tag(tags, rule.outbound, 'route.rules[' + idx + '].outbound');
	}
}

function build_inbounds(global_section) {
	let inbounds = [];
	let numeric = {
		listen_port: true,
		mtu: true
	};
	let boolean = {
		auto_route: true,
		strict_route: true
	};
	let skip = {};

	uci.foreach(CONFIG, 'inbound', function(section) {
		if (!as_bool(section.enabled, true))
			return;

		let inbound = {
			type: as_string(section.type, ''),
			tag: as_string(section.tag, '')
		};

		if (inbound.type == '' || inbound.tag == '')
			return;

		pick_dynamic_fields(section, {
			out: inbound,
			skip: skip,
			numeric: numeric,
			boolean: boolean
		});

		let extra = parse_extra_json(section.extra_json, 'inbound ' + as_string(section['.name'], '?'));
		if (extra != null)
			deep_merge(inbound, extra);

		push(inbounds, inbound);
	});

	if (length(inbounds) > 0)
		return inbounds;

	if (!as_bool(global_section.tun_enable, true))
		return inbounds;

	let fallback_tun = {
		type: 'tun',
		tag: as_string(global_section.tun_tag, 'tun-in'),
		interface_name: as_string(global_section.tun_interface_name, 'tun0'),
		mtu: as_int(global_section.tun_mtu, 1500),
		auto_route: as_bool(global_section.tun_auto_route, true),
		strict_route: as_bool(global_section.tun_strict_route, true),
		stack: as_string(global_section.tun_stack, 'system')
	};
	let tun_address = list_nonempty(global_section.tun_address);
	if (length(tun_address) > 0)
		fallback_tun.address = tun_address;

	push(inbounds, fallback_tun);

	return inbounds;
}

function build_dns(global_section) {
	if (!as_bool(global_section.dns_enable, true))
		return null;

	let dns = {
		servers: build_dns_servers()
	};
	let rules = build_dns_rules();

	set_when(dns, 'strategy', as_string(global_section.dns_strategy, ''));
	set_when(dns, 'final', as_string(global_section.dns_final, ''));
	let cache_capacity = as_int(global_section.dns_cache_capacity, null);
	if (cache_capacity != null)
		dns.cache_capacity = cache_capacity;
	if (length(rules) > 0)
		dns.rules = rules;

	return dns;
}

function build_base_config() {
	let global_section = uci.get_all(CONFIG, 'main');
	if (global_section == null)
		global_section = {};
	let outbounds = build_outbounds();
	let default_outbound = as_string(global_section.default_outbound, 'proxy');

	if (length(outbounds) == 0) {
		default_outbound = 'direct';
		outbounds = [
			{ type: 'direct', tag: 'direct' },
			{ type: 'block', tag: 'block' }
		];
	}

	let route = {
		auto_detect_interface: as_bool(global_section.route_auto_detect_interface, true),
		final: default_outbound,
		rules: build_route_rules(global_section, default_outbound)
	};
	let domain_resolver_server = as_string(global_section.route_default_domain_resolver_server, '');
	if (domain_resolver_server != '')
		route.default_domain_resolver = { server: domain_resolver_server };

	let rule_set = build_rule_set();
	if (length(rule_set) > 0)
		route.rule_set = rule_set;

	let cfg = {
		log: {
			level: as_string(global_section.log_level, 'info')
		},
		inbounds: build_inbounds(global_section),
		outbounds: outbounds,
		route: route
	};
	if (as_bool(global_section.log_timestamp, false))
		cfg.log.timestamp = true;

	if (as_bool(global_section.experimental_cache_enabled, false)) {
		if (cfg.experimental == null)
			cfg.experimental = {};

		cfg.experimental.cache_file = {
			enabled: true
		};
		set_when(cfg.experimental.cache_file, 'path', as_string(global_section.experimental_cache_path, ''));
	}

	if (as_bool(global_section.clash_api_enabled, false)) {
		if (cfg.experimental == null)
			cfg.experimental = {};

		cfg.experimental.clash_api = {
			external_controller: as_string(global_section.clash_api_listen, '127.0.0.1:9090')
		};
		set_when(cfg.experimental.clash_api, 'secret', as_string(global_section.clash_api_secret, ''));
	}

	let dns = build_dns(global_section);
	if (dns != null)
		cfg.dns = dns;

	let global_extra = parse_extra_json(global_section.extra_json, 'global main');
	if (global_extra != null)
		deep_merge(cfg, global_extra);

	return cfg;
}

function collect_fragments() {
	let fragments = [];

	uci.foreach(CONFIG, 'json_fragment', function(section) {
		if (!as_bool(section.enabled, false))
			return;

		let path = as_string(section.path, '');
		if (path == '')
			return;

		push(fragments, {
			path: path,
			order: as_int(section.order, 100)
		});
	});

	for (let i = 0; i < length(fragments); i++) {
		for (let j = i + 1; j < length(fragments); j++) {
			if (fragments[i].order > fragments[j].order) {
				let tmp = fragments[i];
				fragments[i] = fragments[j];
				fragments[j] = tmp;
			}
		}
	}

	return fragments;
}

function apply_fragments(cfg) {
	let fragments = collect_fragments();

	for (let fragment in fragments) {
		let raw = fs.readfile(fragment.path);
		if (raw == null)
			die('Unable to read fragment file: ' + fragment.path);

		let parsed;
		try {
			parsed = json(raw);
		}
		catch (e) {
			die('Invalid JSON fragment in ' + fragment.path + ': ' + e);
		}

		if (type(parsed) != 'object')
			die('JSON fragment must be an object: ' + fragment.path);

		deep_merge(cfg, parsed);
	}
}

let generated = build_base_config();
apply_fragments(generated);
validate_outbound_references(generated);

printf("%J\n", generated);
