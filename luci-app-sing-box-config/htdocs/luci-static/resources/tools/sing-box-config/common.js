'use strict';
'require baseclass';
'require fs';

var CLI_PATH = '/usr/libexec/sing-box-config-cli';

function emptyCatalog() {
	return {
		schema_version: 1,
		source: 'SagerNet',
		source_type: 'empty',
		updated_at: '',
		items: []
	};
}

function toErrorMessage(err, fallback) {
	if (!err)
		return fallback;

	if (typeof err === 'string')
		return err;

	if (err.message)
		return err.message;

	return String(err);
}

function runCatalogCommand(args, includeStderr) {
	if (typeof fs.exec_direct === 'function') {
		/* catalog JSON is large and can exceed ubus file.exec limits */
		return fs.exec_direct(CLI_PATH, args, 'text', false, !!includeStderr).then(function(stdout) {
			return { code: 0, stdout: stdout || '' };
		});
	}

	return fs.exec(CLI_PATH, args);
}

function parseCatalogResult(res) {
	var payload;

	if (!res || res.code !== 0)
		throw new Error((res && (res.stderr || res.stdout)) || 'Каталог недоступен');

	try {
		payload = JSON.parse(res.stdout || '{}');
	}
	catch (e) {
		throw new Error('Backend вернул некорректный JSON каталога: ' + e.message);
	}

	if (!payload || !Array.isArray(payload.items))
		payload = emptyCatalog();

	payload.items.sort(function(a, b) {
		return String((a.kind || '') + ':' + (a.tag || '')).localeCompare(String((b.kind || '') + ':' + (b.tag || '')));
	});

	return payload;
}

function indexCatalogByTag(catalog) {
	var lookup = {};
	var items = (catalog && Array.isArray(catalog.items)) ? catalog.items : [];

	for (var i = 0; i < items.length; i++) {
		var item = items[i];
		var tag = String((item && item.tag) || '');
		if (tag)
			lookup[tag] = item;
	}

	return lookup;
}

function sourceText(catalog) {
	if (!catalog)
		return 'Каталог недоступен';

	var label = catalog.source_type === 'github' ? 'Обновлено с GitHub' :
		(catalog.source_type === 'empty' ? 'Каталог пуст' : 'Встроенный снапшот');
	var updated = catalog.updated_at ? ' | ' + catalog.updated_at : '';
	var count = Array.isArray(catalog.items) ? catalog.items.length : 0;

	return label + updated + ' | записей: ' + count;
}

function loadCatalogSafe() {
	return runCatalogCommand([ 'catalog' ]).then(function(res) {
		return { catalog: parseCatalogResult(res), error: '' };
	}).catch(function(err) {
		return {
			catalog: emptyCatalog(),
			error: toErrorMessage(err, 'Каталог недоступен')
		};
	});
}

return baseclass.extend({
	modalOnly: function(option) {
		option.modalonly = true;
		return option;
	},

	toErrorMessage: toErrorMessage,
	runCatalogCommand: runCatalogCommand,
	parseCatalogResult: parseCatalogResult,
	emptyCatalog: emptyCatalog,
	indexCatalogByTag: indexCatalogByTag,
	sourceText: sourceText,
	loadCatalogSafe: loadCatalogSafe
});
