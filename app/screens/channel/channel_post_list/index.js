// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import {bindActionCreators} from 'redux';
import {connect} from 'react-redux';

import {selectPost} from 'mattermost-redux/actions/posts';
import {RequestStatus} from 'mattermost-redux/constants';
import {makeGetPostsInChannel} from 'mattermost-redux/selectors/entities/posts';
import {getMyCurrentChannelMembership, makeGetChannel} from 'mattermost-redux/selectors/entities/channels';
import {loadPostsIfNecessaryWithRetry, loadThreadIfNecessary, increasePostVisibility, refreshChannelWithRetry} from 'app/actions/views/channel';
import {getTheme} from 'app/selectors/preferences';

import ChannelPostList from './channel_post_list';

function makeMapStateToProps() {
    const getChannel = makeGetChannel();
    const getPostsInChannel = makeGetPostsInChannel();

    return function mapStateToProps(state, ownProps) {
        const channelId = ownProps.channelId;
        const {getPosts, getPostsRetryAttempts, getPostsSince, getPostsSinceRetryAttempts} = state.requests.posts;
        const posts = getPostsInChannel(state, channelId) || [];
        const {websocket: websocketRequest} = state.requests.general;
        const {connection: networkOnline} = state.views;
        const webSocketOnline = websocketRequest.status === RequestStatus.SUCCESS;

        let getPostsStatus;
        if (getPostsRetryAttempts > 0) {
            getPostsStatus = getPosts.status;
        } else if (getPostsSinceRetryAttempts > 1) {
            getPostsStatus = getPostsSince.status;
        }

        let channelIsRefreshing = state.views.channel.refreshing;
        let channelRefreshingFailed = getPostsStatus === RequestStatus.FAILURE && webSocketOnline;
        if (!networkOnline) {
            channelIsRefreshing = false;
            channelRefreshingFailed = false;
        }

        return {
            channel: getChannel(state, {id: channelId}),
            channelIsLoading: state.views.channel.loading,
            channelIsRefreshing,
            channelRefreshingFailed,
            posts,
            postVisibility: state.views.channel.postVisibility[channelId],
            loadingPosts: state.views.channel.loadingPosts[channelId],
            myMember: getMyCurrentChannelMembership(state),
            networkOnline,
            theme: getTheme(state),
            ...ownProps
        };
    };
}

function mapDispatchToProps(dispatch) {
    return {
        actions: bindActionCreators({
            loadPostsIfNecessaryWithRetry,
            loadThreadIfNecessary,
            increasePostVisibility,
            selectPost,
            refreshChannelWithRetry
        }, dispatch)
    };
}

export default connect(makeMapStateToProps, mapDispatchToProps)(ChannelPostList);
