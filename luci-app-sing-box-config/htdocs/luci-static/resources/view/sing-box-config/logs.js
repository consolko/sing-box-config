'use strict';
'require view';
'require fs';
'require poll';

var CLI_PATH = '/usr/libexec/sing-box-config-cli';
var DEFAULT_LIMIT = '300';

return view.extend({
	paused: false,
	userScrolled: false,

	load: function() {
		return Promise.resolve();
	},

	isNearBottom: function(node) {
		return node.scrollHeight - node.scrollTop - node.clientHeight < 16;
	},

	renderLogLines: function(panel, lines) {
		panel.textContent = lines && lines.length ? lines.join('\n') : 'Строк sing-box в logread не найдено';
	},

	updateStatus: function(statusNode, message) {
		statusNode.textContent = message;
	},

	updateLogs: function(panel, statusNode, limitSelect) {
		var limit = limitSelect.value || DEFAULT_LIMIT;
		var shouldStick = !this.userScrolled || this.isNearBottom(panel);

		return fs.exec(CLI_PATH, [ 'logs', limit ]).then(L.bind(function(res) {
			var data;

			if (res.code !== 0)
				throw new Error((res.stderr || res.stdout || 'logs failed').trim());

			data = JSON.parse(res.stdout || '{}');
			if (!data.available)
				throw new Error(data.reason || 'logread недоступен');

			this.renderLogLines(panel, data.lines || []);
			this.updateStatus(statusNode, 'logread | строк: ' + (data.count || 0) + ' | лимит: ' + (data.limit || limit));

			if (shouldStick)
				panel.scrollTop = panel.scrollHeight;
		}, this)).catch(L.bind(function(err) {
			this.renderLogLines(panel, [ 'Ошибка: ' + (err.message || String(err)) ]);
			this.updateStatus(statusNode, 'logread недоступен');
		}, this));
	},

	render: function() {
		var panel = E('pre', {
			'class': 'cbi-section',
			'style': 'min-height: 420px; max-height: 65vh; overflow: auto; white-space: pre-wrap; font-family: monospace; font-size: 12px; line-height: 1.45;'
		}, 'Загрузка...');
		var statusNode = E('span', {}, 'logread');
		var limitSelect = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { value: '100' }, '100'),
			E('option', { value: '300', selected: 'selected' }, '300'),
			E('option', { value: '1000' }, '1000')
		]);
		var pauseButton = E('button', { 'class': 'btn cbi-button', type: 'button' }, 'Pause');
		var refreshButton = E('button', { 'class': 'btn cbi-button cbi-button-apply', type: 'button' }, 'Refresh');
		var clearButton = E('button', { 'class': 'btn cbi-button cbi-button-remove', type: 'button' }, 'Clear view');

		panel.onscroll = L.bind(function() {
			this.userScrolled = !this.isNearBottom(panel);
		}, this);

		pauseButton.onclick = L.bind(function() {
			this.paused = !this.paused;
			pauseButton.textContent = this.paused ? 'Resume' : 'Pause';
			this.updateStatus(statusNode, this.paused ? 'paused' : 'logread');
			if (!this.paused)
				return this.updateLogs(panel, statusNode, limitSelect);
		}, this);

		refreshButton.onclick = L.bind(function() {
			return this.updateLogs(panel, statusNode, limitSelect);
		}, this);

		clearButton.onclick = L.bind(function() {
			panel.textContent = '';
			this.userScrolled = false;
		}, this);

		limitSelect.onchange = L.bind(function() {
			this.userScrolled = false;
			return this.updateLogs(panel, statusNode, limitSelect);
		}, this);

		this.updateLogs(panel, statusNode, limitSelect);
		poll.add(L.bind(function() {
			if (this.paused)
				return Promise.resolve();

			return this.updateLogs(panel, statusNode, limitSelect);
		}, this), 2);

		return E('div', [
			E('h2', 'Sing-box Config'),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', 'Логи sing-box'),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, 'Последние строки'),
					E('div', { 'class': 'cbi-value-field' }, [
						limitSelect,
						' ',
						refreshButton,
						' ',
						pauseButton,
						' ',
						clearButton
					])
				]),
				E('p', statusNode),
				panel
			])
		]);
	}
});
