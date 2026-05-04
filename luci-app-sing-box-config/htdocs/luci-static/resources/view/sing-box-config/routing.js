'use strict';
'require view';
'require form';
'require uci';
'require tools.sing-box-config.common as common';

return view.extend({
	load: function() {
		return uci.load('sing-box-config');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('sing-box-config', 'Sing-box Config');
		m.description = 'Routing rules';

		s = m.section(form.GridSection, 'route_rule', 'Routing rules');
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.nodescriptions = true;
		s.modaltitle = 'Route rule';
		s.max_cols = 4;

			o = s.option(form.Flag, 'enabled', 'Enable');
			o.default = '1';
			o.rmempty = false;
			o.editable = true;

		o = s.option(form.Value, 'label', 'Name');
		o.editable = true;

		o = s.option(form.ListValue, 'action', 'Action');
		o.value('proxy', 'Proxy');
		o.value('direct', 'Direct');
		o.value('block', 'Block');
		o.value('route', 'route');
		o.value('reject', 'reject');
		o.value('hijack-dns', 'hijack-dns');
		o.value('sniff', 'sniff');
		o.value('custom', 'Custom');
		o.default = 'proxy';
		o.editable = true;

		o = s.option(form.Value, 'outbound', 'Outbound tag');
		o.placeholder = 'proxy';
		o.editable = true;
		o.depends({ action: 'proxy' });
		o.depends({ action: 'direct' });
		o.depends({ action: 'block' });
		o.depends({ action: 'route' });
		o.depends({ action: 'custom' });

			o = common.modalOnly(s.option(form.Value, 'rule_action', 'Custom action'));
		o.placeholder = 'route';
		o.depends('action', 'custom');

			o = common.modalOnly(s.option(form.Flag, 'invert', 'Invert'));
		o.default = '0';
			common.modalOnly(s.option(form.DynamicList, 'domain', 'Domain'));
			common.modalOnly(s.option(form.DynamicList, 'domain_suffix', 'Domain suffix'));
			common.modalOnly(s.option(form.DynamicList, 'domain_keyword', 'Domain keyword'));
			common.modalOnly(s.option(form.DynamicList, 'inbound', 'Inbound tags'));
			common.modalOnly(s.option(form.DynamicList, 'ip_cidr', 'IP CIDR'));
			common.modalOnly(s.option(form.DynamicList, 'source_ip_cidr', 'Source IP CIDR'));
			o = common.modalOnly(s.option(form.Flag, 'ip_is_private', 'ip_is_private'));
		o.default = '0';
			o = common.modalOnly(s.option(form.Flag, 'source_ip_is_private', 'source_ip_is_private'));
		o.default = '0';
			common.modalOnly(s.option(form.DynamicList, 'port', 'Port'));
			common.modalOnly(s.option(form.DynamicList, 'source_port', 'Source port'));
			common.modalOnly(s.option(form.DynamicList, 'protocol', 'Protocol'));
			common.modalOnly(s.option(form.DynamicList, 'network', 'Network'));
			o = common.modalOnly(s.option(form.DynamicList, 'sniffer', 'Sniffer'));
		o.depends({ action: 'sniff' });
			common.modalOnly(s.option(form.DynamicList, 'process_name', 'Process name'));
			common.modalOnly(s.option(form.DynamicList, 'package_name', 'Package name'));
			common.modalOnly(s.option(form.DynamicList, 'rule_set', 'Rule set tags'));
			common.modalOnly(s.option(form.DynamicList, 'source_mac_address', 'Source MAC'));
			common.modalOnly(s.option(form.DynamicList, 'source_hostname', 'Source hostname'));
			o = common.modalOnly(s.option(form.Value, 'extra_json', 'extra_json'));
		o.monospace = true;

		return m.render();
	}
});
