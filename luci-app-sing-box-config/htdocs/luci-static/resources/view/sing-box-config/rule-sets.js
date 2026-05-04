'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require tools.sing-box-config.common as common';

var TAG_DATALIST_ID = 'sing-box-config-rule-set-tag-catalog';

function setOptionValue(option, sectionId, optionName, value) {
	var widget;
	var input;
	var normalized = String(value || '');

	uci.set('sing-box-config', sectionId, optionName, normalized);

	widget = option.getUIElement(sectionId);
	if (widget && typeof widget.setValue === 'function')
		widget.setValue(normalized);

	input = document.getElementById('widget.' + option.cbid(sectionId));
	if (input && input.value !== normalized)
		input.value = normalized;
}

function applyCatalogAutofill(sectionId, value, ctx) {
	var tag = String(value || '');
	var item = ctx.catalogByTag[tag];

	if (!item)
		return;

	setOptionValue(ctx.tag, sectionId, 'tag', item.tag || tag);
	setOptionValue(ctx.type, sectionId, 'type', 'remote');
	setOptionValue(ctx.format, sectionId, 'format', item.format || 'binary');
	setOptionValue(ctx.url, sectionId, 'url', item.url || '');
	setOptionValue(ctx.updateInterval, sectionId, 'update_interval', '1d');
	setOptionValue(ctx.path, sectionId, 'path', '');
}

function renderTagDatalist(catalog) {
	var items = (catalog && Array.isArray(catalog.items)) ? catalog.items : [];
	var options = [];

	for (var i = 0; i < items.length; i++) {
		var item = items[i] || {};
		var tag = String(item.tag || '');

		if (!tag)
			continue;

		options.push(E('option', { 'value': tag }, [
			(item.kind === 'geoip' ? 'GeoIP' : 'Geosite'),
			' | ',
			String(item.name || '-')
		]));
	}

	return E('datalist', { 'id': TAG_DATALIST_ID }, options);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('sing-box-config'),
			common.loadCatalogSafe()
		]);
	},

	render: function(data) {
		var catalogState = data[1] || { catalog: common.emptyCatalog(), error: '' };
		var catalog = catalogState.catalog || common.emptyCatalog();
		var catalogByTag = common.indexCatalogByTag(catalog);
		var m, s, o;
		var tagOption, typeOption, formatOption, urlOption, pathOption, updateIntervalOption;
		var autofillContext;

		m = new form.Map('sing-box-config', 'Sing-box Config');
		m.description = 'Rule sets';

		s = m.section(form.GridSection, 'rule_set', 'Rule sets');
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.nodescriptions = true;
		s.modaltitle = 'Rule set';
		s.max_cols = 4;

			o = s.option(form.Flag, 'enabled', 'Enable');
			o.default = '1';
			o.rmempty = false;
			o.editable = true;

		tagOption = s.option(form.Value, 'tag', 'Tag');
		tagOption.rmempty = false;
		tagOption.editable = true;
		tagOption.renderWidget = function(section_id, option_index, cfgvalue) {
			var node = form.Value.prototype.renderWidget.apply(this, [ section_id, option_index, cfgvalue ]);
			var input = node.querySelector('input');

			if (input) {
				input.setAttribute('list', TAG_DATALIST_ID);
				input.setAttribute('autocomplete', 'off');
			}

			return node;
		};
		tagOption.onchange = function(ev, section_id, value) {
			applyCatalogAutofill(section_id, value, autofillContext);
		};

		typeOption = s.option(form.ListValue, 'type', 'Type');
		typeOption.value('remote');
		typeOption.value('local');
		typeOption.value('inline');
		typeOption.default = 'remote';
		typeOption.editable = true;

		formatOption = s.option(form.Value, 'format', 'Format');
		formatOption.placeholder = 'source';
		formatOption.editable = true;

		urlOption = common.modalOnly(s.option(form.Value, 'url', 'URL'));
		urlOption.depends('type', 'remote');

		pathOption = common.modalOnly(s.option(form.Value, 'path', 'Path'));
		pathOption.depends('type', 'local');

		o = common.modalOnly(s.option(form.Value, 'download_detour', 'Download detour'));
		o.depends('type', 'remote');

		updateIntervalOption = common.modalOnly(s.option(form.Value, 'update_interval', 'Update interval'));
		updateIntervalOption.depends('type', 'remote');

		o = common.modalOnly(s.option(form.Value, 'extra_json', 'extra_json'));
		o.monospace = true;

		autofillContext = {
			catalogByTag: catalogByTag,
			tag: tagOption,
			type: typeOption,
			format: formatOption,
			url: urlOption,
			path: pathOption,
			updateInterval: updateIntervalOption
		};

		if (catalogState.error)
			ui.addNotification(null, E('p', 'Каталог недоступен для автоподсказок: ' + catalogState.error));

		return m.render().then(function(node) {
			node.appendChild(renderTagDatalist(catalog));
			return node;
		});
	}
});
