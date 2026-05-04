'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require poll';

var CLI_PATH = '/usr/libexec/sing-box-config-cli';
var lastRuntimeSnapshot = null;

function asBool(value) {
	return value === true || value === '1' || value === 1 || value === 'true' || value === 'yes' || value === 'on';
}

function asNumber(value) {
	var number = Number(value || 0);
	return isNaN(number) ? 0 : number;
}

function formatBytes(value) {
	var bytes = asNumber(value);
	var units = [ 'B', 'KB', 'MB', 'GB', 'TB' ];
	var idx = 0;

	while (bytes >= 1024 && idx < units.length - 1) {
		bytes = bytes / 1024;
		idx++;
	}

	if (idx === 0)
		return String(Math.round(bytes)) + ' ' + units[idx];

	return bytes.toFixed(bytes >= 10 ? 1 : 2) + ' ' + units[idx];
}

function formatRate(value) {
	return formatBytes(value) + '/s';
}

function latestDelay(proxy) {
	var history = proxy && Array.isArray(proxy.history) ? proxy.history : [];
	var item;

	if (history.length === 0)
		return '';

	item = history[history.length - 1];
	if (!item || item.delay == null)
		return '';

	return item.delay + ' ms';
}

function uniqueTags(tags) {
	var seen = {};
	var out = [];

	for (var i = 0; i < tags.length; i++) {
		if (!tags[i] || seen[tags[i]])
			continue;

		seen[tags[i]] = true;
		out.push(tags[i]);
	}

	return out;
}

function aggregateConnections(connections) {
	var out = {};

	for (var i = 0; i < connections.length; i++) {
		var conn = connections[i] || {};
		var tags = uniqueTags(Array.isArray(conn.chains) ? conn.chains : []);

		for (var j = 0; j < tags.length; j++) {
			var tag = tags[j];

			if (!out[tag])
				out[tag] = { connections: 0, upload: 0, download: 0 };

			out[tag].connections++;
			out[tag].upload += asNumber(conn.upload);
			out[tag].download += asNumber(conn.download);
		}
	}

	return out;
}

function computeRates(totals) {
	var now = Date.now();
	var rates = {};

	if (lastRuntimeSnapshot && lastRuntimeSnapshot.time < now) {
		var seconds = Math.max((now - lastRuntimeSnapshot.time) / 1000, 1);

		for (var tag in totals) {
			var previous = lastRuntimeSnapshot.totals[tag] || { upload: 0, download: 0 };
			var current = totals[tag];

			rates[tag] = {
				upload: current.upload >= previous.upload ? (current.upload - previous.upload) / seconds : 0,
				download: current.download >= previous.download ? (current.download - previous.download) / seconds : 0
			};
		}
	}

	lastRuntimeSnapshot = { time: now, totals: totals };
	return rates;
}

function statusLabel(section, proxy, stats, api) {
	if (!asBool(section.enabled == null ? '1' : section.enabled))
		return 'Отключен в UCI';

	if (!api || !api.available)
		return 'API недоступен';

	if (!proxy)
		return 'Не загружен';

	if (stats && stats.connections > 0)
		return 'Активен';

	return 'Готов';
}

function renderRuntimeTable(data) {
	var api = data.clashApi || {};
	var proxyMap = (data.proxies && data.proxies.proxies) || {};
	var connectionData = data.connections || {};
	var connections = Array.isArray(connectionData.connections) ? connectionData.connections : [];
	var sections = uci.sections('sing-box-config', 'outbound') || [];
	var totals = aggregateConnections(connections);
	var rates = computeRates(totals);
	var rows = [];

	for (var i = 0; i < sections.length; i++) {
		var section = sections[i] || {};
		var tag = section.tag || '';
		var proxy = tag ? proxyMap[tag] : null;
		var stats = totals[tag] || { connections: 0, upload: 0, download: 0 };
		var rate = rates[tag] || { upload: 0, download: 0 };
		var groupState = proxy && proxy.now ? proxy.now : '';
		var delay = latestDelay(proxy);

		rows.push(E('tr', [
			E('td', tag || section['.name'] || '-'),
			E('td', section.type || (proxy && proxy.type) || '-'),
			E('td', statusLabel(section, proxy, stats, api)),
			E('td', String(stats.connections || 0)),
			E('td', formatBytes(stats.upload) + ' / ' + formatBytes(stats.download)),
			E('td', formatRate(rate.upload) + ' / ' + formatRate(rate.download)),
			E('td', groupState || '-'),
			E('td', delay || '-')
		]));
	}

	if (rows.length === 0)
		rows.push(E('tr', [ E('td', { colspan: 8 }, 'Outbounds не настроены') ]));

	return E('div', { 'class': 'cbi-section' }, [
		E('h3', [
			'Runtime status ',
			E('button', { 'class': 'btn cbi-button runtime-refresh', type: 'button' }, 'Refresh')
		]),
		E('p', [
			api.enabled ? 'Clash API: ' + (api.available ? 'доступен' : 'недоступен') : 'Clash API: выключен',
			api.listen ? ' (' + api.listen + ')' : '',
			api.reason ? ' - ' + api.reason : '',
			' | Соединений: ' + connections.length,
			' | Total: up ' + formatBytes(connectionData.uploadTotal) + ', down ' + formatBytes(connectionData.downloadTotal)
		]),
		E('div', { 'class': 'table' }, [
			E('table', { 'class': 'table cbi-section-table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', 'Tag'),
					E('th', 'Type'),
					E('th', 'Status'),
					E('th', 'Conn'),
					E('th', 'Up / Down'),
					E('th', 'Rate Up / Down'),
					E('th', 'Now'),
					E('th', 'Delay')
				])
			].concat(rows))
		])
	]);
}

function renderRuntimeError(message) {
	lastRuntimeSnapshot = null;

	return E('div', { 'class': 'cbi-section' }, [
		E('h3', [
			'Runtime status ',
			E('button', { 'class': 'btn cbi-button runtime-refresh', type: 'button' }, 'Refresh')
		]),
		E('p', 'Статус недоступен: ' + message)
	]);
}

return view.extend({
	load: function() {
		return uci.load('sing-box-config');
	},

	updateRuntimeStatus: function(container) {
		return fs.exec(CLI_PATH, [ 'runtime-status' ]).then(L.bind(function(res) {
			var data;

			if (res.code !== 0)
				throw new Error((res.stderr || res.stdout || 'runtime-status failed').trim());

			data = JSON.parse(res.stdout || '{}');
			container.innerHTML = '';
			container.appendChild(renderRuntimeTable(data));
			container.querySelector('.runtime-refresh').onclick = L.bind(function() {
				return this.updateRuntimeStatus(container);
			}, this);
		}, this)).catch(L.bind(function(err) {
			container.innerHTML = '';
			container.appendChild(renderRuntimeError(err.message || String(err)));
			container.querySelector('.runtime-refresh').onclick = L.bind(function() {
				return this.updateRuntimeStatus(container);
			}, this);
		}, this));
	},

	render: function() {
		var m, s, o;
		var runtimeContainer = E('div', { id: 'sing-box-runtime-status' }, [
			E('div', { 'class': 'cbi-section' }, [
				E('h3', 'Runtime status'),
				E('p', 'Загрузка...')
			])
		]);

		m = new form.Map('sing-box-config', 'Sing-box Config');
		m.description = 'Общие параметры генерации /etc/sing-box/config.json';

		s = m.section(form.NamedSection, 'main', 'global', 'Общее');
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', 'Включить сервис');
		o.rmempty = false;

		o = s.option(form.ListValue, 'log_level', 'Уровень логов');
		o.value('trace', 'trace');
		o.value('debug', 'debug');
		o.value('info', 'info');
		o.value('warn', 'warn');
		o.value('error', 'error');
		o.default = 'info';

		o = s.option(form.Flag, 'log_timestamp', 'Добавлять timestamp в лог');
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'default_outbound', 'Тег outbound по умолчанию');
		o.placeholder = 'proxy';
		o.rmempty = false;

		o = s.option(form.Flag, 'experimental_cache_enabled', 'Experimental cache_file enabled');
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.Value, 'experimental_cache_path', 'Cache file path');
		o.placeholder = '/tmp/sing-box-cache.db';
		o.depends('experimental_cache_enabled', '1');

		o = s.option(form.Flag, 'clash_api_enabled', 'Clash API enabled');
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'clash_api_listen', 'Clash API listen');
		o.placeholder = '127.0.0.1:9090';
		o.depends('clash_api_enabled', '1');

		o = s.option(form.Value, 'clash_api_secret', 'Clash API secret');
		o.password = true;
		o.depends('clash_api_enabled', '1');

		o = s.option(form.Flag, 'route_auto_detect_interface', 'Автоопределение интерфейса');
		o.rmempty = false;

		o = s.option(form.Value, 'extra_json', 'extra_json');
		o.monospace = true;

		return m.render().then(L.bind(function(mapNode) {
			this.updateRuntimeStatus(runtimeContainer);
			poll.add(L.bind(function() {
				return this.updateRuntimeStatus(runtimeContainer);
			}, this), 3);

			return E('div', [
				mapNode,
				runtimeContainer
			]);
		}, this));
	}
});
