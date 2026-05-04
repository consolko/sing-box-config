'use strict';
'require view';
'require uci';
'require ui';
'require tools.sing-box-config.common as common';

var currentKind = 'all';
var currentQuery = '';
var currentCatalog = null;

function existingRuleSetTags() {
	var sections = uci.sections('sing-box-config', 'rule_set') || [];
	var tags = {};

	for (var i = 0; i < sections.length; i++) {
		if (sections[i] && sections[i].tag)
			tags[sections[i].tag] = true;
	}

	return tags;
}

function itemMatches(item) {
	var query = currentQuery.toLowerCase();
	var tag = String(item.tag || '');
	var name = String(item.name || '');

	if (currentKind !== 'all' && item.kind !== currentKind)
		return false;

	if (query && (tag.toLowerCase().indexOf(query) === -1) && (name.toLowerCase().indexOf(query) === -1))
		return false;

	return true;
}

function applyUciChanges() {
	return uci.save().then(function() {
		if (ui.changes && ui.changes.apply)
			return ui.changes.apply(false);
	});
}

function addRuleSet(item, tableNode, sourceNode) {
	return uci.load('sing-box-config').then(function() {
		var existing = existingRuleSetTags();
		var sid;

		if (existing[item.tag]) {
			ui.addNotification(null, E('p', 'Rule set уже добавлен: ' + item.tag));
			renderCatalogTable(tableNode, currentCatalog);
			return null;
		}

		sid = uci.add('sing-box-config', 'rule_set');
		uci.set('sing-box-config', sid, 'enabled', '1');
		uci.set('sing-box-config', sid, 'tag', item.tag);
		uci.set('sing-box-config', sid, 'type', 'remote');
		uci.set('sing-box-config', sid, 'format', item.format || 'binary');
		uci.set('sing-box-config', sid, 'url', item.url);
		uci.set('sing-box-config', sid, 'update_interval', '1d');

		return applyUciChanges().then(function() {
			ui.addNotification(null, E('p', 'Rule set добавлен: ' + item.tag));
			if (sourceNode)
				sourceNode.textContent = common.sourceText(currentCatalog);
			renderCatalogTable(tableNode, currentCatalog);
		});
	}).catch(function(err) {
		ui.addNotification(null, E('p', 'Ошибка добавления rule set: ' + (err.message || err)));
	});
}

function renderCatalogTable(container, catalog) {
	var existing = existingRuleSetTags();
	var rows = [];
	var shown = 0;
	var items = (catalog && Array.isArray(catalog.items)) ? catalog.items : [];
	var table;

	for (var i = 0; i < items.length; i++) {
		var item = items[i] || {};
		var added = !!existing[item.tag];
		var button;

		if (!itemMatches(item))
			continue;

		shown++;
		button = E('button', {
			'class': 'btn cbi-button cbi-button-apply',
			'type': 'button',
			'disabled': added ? 'disabled' : null,
			'click': L.bind(addRuleSet, null, item, container, null)
		}, added ? 'Уже добавлен' : 'Добавить');

		rows.push(E('tr', [
			E('td', item.kind === 'geoip' ? 'GeoIP' : 'Geosite'),
			E('td', item.name || '-'),
			E('td', E('code', item.tag || '-')),
			E('td', item.source || 'SagerNet'),
			E('td', added ? 'Уже добавлен' : 'Доступен'),
			E('td', button)
		]));
	}

	if (rows.length === 0) {
		rows.push(E('tr', [
			E('td', { 'colspan': '6' }, shown === 0 ? 'Ничего не найдено' : 'Каталог пуст')
		]));
	}

	table = E('div', [
		E('p', { 'class': 'cbi-section-descr' }, 'Показано: ' + shown),
		E('table', { 'class': 'table cbi-section-table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, 'Тип'),
				E('th', { 'class': 'th' }, 'Имя'),
				E('th', { 'class': 'th' }, 'Tag'),
				E('th', { 'class': 'th' }, 'Источник'),
				E('th', { 'class': 'th' }, 'Статус'),
				E('th', { 'class': 'th' }, '')
			])
		].concat(rows))
	]);

	while (container.firstChild)
		container.removeChild(container.firstChild);

	container.appendChild(table);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('sing-box-config'),
			common.runCatalogCommand([ 'catalog' ]).catch(function(err) {
				return {
					code: 1,
					stderr: common.toErrorMessage(err, 'Каталог недоступен')
				};
			})
		]);
	},

	render: function(data) {
		var catalogResult = data[1];
		var sourceNode = E('span');
		var tableNode = E('div');
		var searchInput;
		var kindSelect;
		var refreshButton;
		var root;

		try {
			currentCatalog = common.parseCatalogResult(catalogResult);
		}
		catch (e) {
			currentCatalog = common.emptyCatalog();
			ui.addNotification(null, E('p', e.message || e));
		}

		sourceNode.textContent = common.sourceText(currentCatalog);

		searchInput = E('input', {
			'class': 'cbi-input-text',
			'placeholder': 'Поиск по имени или tag',
			'value': currentQuery,
			'input': function(ev) {
				currentQuery = ev.target.value || '';
				renderCatalogTable(tableNode, currentCatalog);
			}
		});

		kindSelect = E('select', {
			'class': 'cbi-input-select',
			'change': function(ev) {
				currentKind = ev.target.value || 'all';
				renderCatalogTable(tableNode, currentCatalog);
			}
		}, [
			E('option', { 'value': 'all', 'selected': currentKind === 'all' ? 'selected' : null }, 'Все'),
			E('option', { 'value': 'geosite', 'selected': currentKind === 'geosite' ? 'selected' : null }, 'Geosite'),
			E('option', { 'value': 'geoip', 'selected': currentKind === 'geoip' ? 'selected' : null }, 'GeoIP')
		]);

			refreshButton = E('button', {
				'class': 'btn cbi-button cbi-button-apply',
				'type': 'button',
				'click': function() {
					refreshButton.disabled = true;

					return common.runCatalogCommand([ 'catalog-refresh' ], true).then(function(res) {
						currentCatalog = common.parseCatalogResult(res);
						sourceNode.textContent = common.sourceText(currentCatalog);
						renderCatalogTable(tableNode, currentCatalog);
						ui.addNotification(null, E('p', 'Каталог обновлен'));
						refreshButton.disabled = false;
					}).catch(function(err) {
						ui.addNotification(null, E('p', 'Ошибка обновления каталога: ' + common.toErrorMessage(err, 'неизвестная ошибка')));
						renderCatalogTable(tableNode, currentCatalog);
						refreshButton.disabled = false;
					});
				}
			}, 'Обновить');

		root = E('div', [
			E('h2', 'Каталог списков'),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'style': 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px' }, [
					searchInput,
					kindSelect,
					refreshButton,
					E('span', { 'class': 'cbi-section-descr', 'style': 'margin-left:0' }, sourceNode)
				]),
				tableNode
			])
		]);

		renderCatalogTable(tableNode, currentCatalog);
		return root;
	}
});
