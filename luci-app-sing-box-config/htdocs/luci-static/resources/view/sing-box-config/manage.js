'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require fs';
'require ui';

var CLI_PATH = '/usr/libexec/sing-box-config-cli';

return view.extend({
	callRcList: rpc.declare({
		object: 'rc',
		method: 'list',
		expect: { '': {} }
	}),

	callInitList: rpc.declare({
		object: 'luci',
		method: 'getInitList',
		params: [ 'name' ],
		expect: { '': {} }
	}),

	load: function() {
		return Promise.all([
			uci.load('sing-box-config'),
			uci.load('sing-box'),
			L.resolveDefault(this.callRcList(), {}),
			L.resolveDefault(this.callInitList('sing-box'), {}),
			L.resolveDefault(fs.read('/tmp/sing-box-config.preview.json'), ''),
			L.resolveDefault(fs.read('/var/run/sing-box-config.last_error'), '')
			]);
	},

	serviceStatusText: function(rcState, initState) {
		var state = (rcState && rcState['sing-box']) || (initState && initState['sing-box']) || {};
		var parts = [];

		if (typeof(state.enabled) === 'boolean')
			parts.push(state.enabled ? 'Автозапуск: включен' : 'Автозапуск: выключен');

		if (typeof(state.running) === 'boolean')
			parts.push(state.running ? 'Сервис: запущен' : 'Сервис: остановлен');

		if (parts.length === 0)
			return 'Статус недоступен';

		return parts.join(' | ');
	},

	handleBackendCommand: function(command, successText, reloadAfter) {
		return fs.exec(CLI_PATH, [ command ]).then(function(res) {
			if (res.code !== 0) {
				var msg = (res.stderr || res.stdout || 'Команда завершилась с ошибкой').trim();
				throw new Error(msg);
			}

			ui.addNotification(null, E('p', successText));

			if (reloadAfter)
				window.location.reload();
		}).catch(function(err) {
			ui.addNotification(null, E('p', 'Ошибка: ' + (err.message || err)));
		});
	},

	handleServiceCommand: function(action, successText) {
		return fs.exec(CLI_PATH, [ action ]).then(function(res) {
			if (res.code !== 0) {
				var msg = (res.stderr || res.stdout || 'Команда сервиса не выполнена').trim();
				throw new Error(msg);
			}

			ui.addNotification(null, E('p', successText));
			window.location.reload();
		}).catch(function(err) {
			ui.addNotification(null, E('p', 'Ошибка: ' + (err.message || err)));
		});
	},

	render: function(data) {
		var rcState = data[2] || {};
		var initState = data[3] || {};
		var previewText = data[4] || '';
		var backendError = data[5] || '';
		var m, s, o;

		m = new form.Map('sing-box-config', 'Sing-box Config');
		m.description = 'Управление сервисом, генерацией и JSON fragments';

		s = m.section(form.NamedSection, 'main', 'global', 'Управление');
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', 'Включить сервис');
		o.rmempty = false;

		o = s.option(form.DummyValue, '_service_status', 'Статус сервиса');
		o.cfgvalue = L.bind(function() {
			return this.serviceStatusText(rcState, initState);
		}, this);
		o.write = function() {};

		o = s.option(form.Button, '_import_current', 'Импортировать текущий /etc/sing-box/config.json');
		o.inputtitle = 'Import current JSON -> UCI';
		o.inputstyle = 'apply';
		o.write = function() {};
		o.onclick = L.bind(function() {
			return this.handleBackendCommand('import-current', 'Импорт выполнен', true);
		}, this);

		o = s.option(form.Button, '_preview', 'Сгенерировать preview');
		o.inputtitle = 'Generate preview';
		o.inputstyle = 'apply';
		o.write = function() {};
		o.onclick = L.bind(function() {
			return this.handleBackendCommand('preview', 'Preview обновлен', true);
		}, this);

		o = s.option(form.Button, '_validate', 'Проверить config');
		o.inputtitle = 'Validate';
		o.inputstyle = 'apply';
		o.write = function() {};
		o.onclick = L.bind(function() {
			return this.handleBackendCommand('validate', 'Проверка пройдена', false);
		}, this);

		o = s.option(form.Button, '_apply', 'Применить config');
		o.inputtitle = 'Generate + apply';
		o.inputstyle = 'apply';
		o.write = function() {};
		o.onclick = L.bind(function() {
			return this.handleBackendCommand('apply', 'Конфиг применен', true);
		}, this);

		o = s.option(form.Button, '_start', 'Запустить сервис');
		o.inputtitle = 'Start';
		o.inputstyle = 'apply';
		o.write = function() {};
		o.onclick = L.bind(function() {
			return this.handleServiceCommand('start', 'Сервис запущен');
		}, this);

		o = s.option(form.Button, '_stop', 'Остановить сервис');
		o.inputtitle = 'Stop';
		o.inputstyle = 'remove';
		o.write = function() {};
		o.onclick = L.bind(function() {
			return this.handleServiceCommand('stop', 'Сервис остановлен');
		}, this);

		o = s.option(form.Button, '_restart', 'Перезапустить сервис');
		o.inputtitle = 'Restart';
		o.inputstyle = 'apply';
		o.write = function() {};
		o.onclick = L.bind(function() {
			return this.handleServiceCommand('restart', 'Сервис перезапущен');
		}, this);

		o = s.option(form.TextValue, '_backend_error', 'Последняя ошибка backend');
		o.readonly = true;
		o.rows = 6;
		o.wrap = 'soft';
		o.cfgvalue = function() {
			return backendError || '';
		};
		o.write = function() {};

		o = s.option(form.TextValue, '_preview_json', 'Сгенерированный JSON (preview)');
		o.readonly = true;
		o.rows = 18;
		o.monospace = true;
		o.wrap = 'off';
		o.cfgvalue = function() {
			return previewText || '';
		};
		o.write = function() {};

		s = m.section(form.GridSection, 'json_fragment', 'Advanced JSON fragments');
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.nodescriptions = true;
		s.modaltitle = 'JSON fragment';
		s.max_cols = 4;

		o = s.option(form.Flag, 'enabled', 'Enable');
		o.default = '1';
		o.editable = true;

		o = s.option(form.Value, 'label', 'Label');
		o.editable = true;

		o = s.option(form.Value, 'order', 'Order');
		o.datatype = 'uinteger';
		o.placeholder = '100';
		o.editable = true;

		o = s.option(form.Value, 'path', 'Path to JSON object');
		o.placeholder = '/etc/sing-box/fragments/custom.json';
		o.rmempty = false;
		o.editable = true;

		return m.render();
	}
});
