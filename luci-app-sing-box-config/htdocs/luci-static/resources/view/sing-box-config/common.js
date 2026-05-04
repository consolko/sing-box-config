'use strict';
'require view';
'require tools.sing-box-config.common as common';

return view.extend({
	modalOnly: common.modalOnly,

	render: function() {
		return E('div');
	}
});
