// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import {bindActionCreators} from 'redux';
import {connect} from 'react-redux';

import {purgeOfflineStore} from 'app/actions/views/root';
import {getTheme} from 'app/selectors/preferences';

import AdvancedSettings from './advanced_settings';

function mapStateToProps(state, ownProps) {
    return {
        ...ownProps,
        theme: getTheme(state)
    };
}

function mapDispatchToProps(dispatch) {
    return {
        actions: bindActionCreators({
            purgeOfflineStore
        }, dispatch)
    };
}

export default connect(mapStateToProps, mapDispatchToProps)(AdvancedSettings);
