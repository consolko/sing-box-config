#!/usr/bin/ucode -S

import * as fs from 'fs';

function as_string(value, fallback) {
	if (value == null || value == '')
		return fallback;

	return '' + value;
}

function has_prefix(value, prefix) {
	return substr(value, 0, length(prefix)) == prefix;
}

function has_suffix(value, suffix) {
	let value_len = length(value);
	let suffix_len = length(suffix);

	if (value_len < suffix_len)
		return false;

	return substr(value, value_len - suffix_len, suffix_len) == suffix;
}

function repository_for_kind(kind) {
	return (kind == 'geoip') ? 'sing-geoip' : 'sing-geosite';
}

function catalog_url(kind, file_name) {
	return 'https://raw.githubusercontent.com/SagerNet/' +
		repository_for_kind(kind) + '/rule-set/' + file_name;
}

function base_name(value) {
	let start = 0;

	for (let i = 0; i < length(value); i++) {
		if (substr(value, i, 1) == '/')
			start = i + 1;
	}

	return substr(value, start);
}

function github_entries(payload) {
	if (type(payload) == 'array')
		return payload;

	if (type(payload) == 'object' && type(payload.tree) == 'array')
		return payload.tree;

	return null;
}

function github_file_name(item) {
	let path = as_string(item.path, '');
	if (path != '')
		return base_name(path);

	return as_string(item.name, '');
}

function parse_github_catalog(path, kind, prefix) {
	let raw = fs.readfile(path);
	if (raw == null)
		die('Unable to read GitHub API response: ' + path);

	let payload = json(raw);
	let entries = github_entries(payload);
	if (entries == null)
		die('GitHub API response must contain an entry array: ' + path);

	let out = [];

	for (let item in entries) {
		if (type(item) != 'object')
			continue;

		if (as_string(item.type, 'file') != 'file' && as_string(item.type, 'blob') != 'blob')
			continue;

		let file_name = github_file_name(item);
		if (!has_prefix(file_name, prefix) || !has_suffix(file_name, '.srs'))
			continue;

		let tag = substr(file_name, 0, length(file_name) - 4);
		let url = as_string(item.download_url, '');
		if (url == '')
			url = catalog_url(kind, file_name);

		push(out, {
			kind: kind,
			name: substr(tag, length(prefix)),
			tag: tag,
			url: url,
			format: 'binary',
			source: 'SagerNet'
		});
	}

	return out;
}

function item_key(item) {
	return item.kind + ':' + item.tag;
}

function sort_items(items) {
	for (let i = 0; i < length(items); i++) {
		for (let j = i + 1; j < length(items); j++) {
			if (item_key(items[i]) > item_key(items[j])) {
				let tmp = items[i];
				items[i] = items[j];
				items[j] = tmp;
			}
		}
	}

	return items;
}

if (length(ARGV) < 3)
	die('Usage: catalog-refresh.uc <geosite-api-json> <geoip-api-json> <updated-at>');

let items = [];

for (let item in parse_github_catalog(ARGV[0], 'geosite', 'geosite-'))
	push(items, item);

for (let item in parse_github_catalog(ARGV[1], 'geoip', 'geoip-'))
	push(items, item);

printf('%J\n', {
	schema_version: 1,
	source: 'SagerNet',
	source_type: 'github',
	updated_at: as_string(ARGV[2], ''),
	items: sort_items(items)
});
