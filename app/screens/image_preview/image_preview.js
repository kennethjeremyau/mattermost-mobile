// Copyright (c) 2017-present Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import React, {PureComponent} from 'react';
import PropTypes from 'prop-types';
import {
    Animated,
    Dimensions,
    InteractionManager,
    PanResponder,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import Orientation from 'react-native-orientation';

import EventEmitter from 'mattermost-redux/utils/event_emitter';

import FileAttachmentIcon from 'app/components/file_attachment_list/file_attachment_icon';
import {NavigationTypes} from 'app/constants';
import {emptyFunction} from 'app/utils/general';

import Downloader from './downloader';
import Previewer from './previewer';

const {View: AnimatedView} = Animated;
const {height: deviceHeight, width: deviceWidth} = Dimensions.get('window');
const DRAG_VERTICAL_THRESHOLD_START = 25; // When do we want to start capturing the drag
const DRAG_VERTICAL_THRESHOLD_END = 100; // When do we want to navigate back
const DRAG_HORIZONTAL_THRESHOLD = 50; // Make sure that it's not a sloppy horizontal swipe
const HEADER_HEIGHT = 64;
const STATUSBAR_HEIGHT = Platform.select({
    ios: 0,
    android: 20
});

export default class ImagePreview extends PureComponent {
    static propTypes = {
        actions: PropTypes.shape({
            addFileToFetchCache: PropTypes.func.isRequired
        }),
        canDownloadFiles: PropTypes.bool.isRequired,
        fetchCache: PropTypes.object.isRequired,
        fileId: PropTypes.string.isRequired,
        files: PropTypes.array.isRequired,
        navigator: PropTypes.object,
        statusBarHeight: PropTypes.number,
        theme: PropTypes.object.isRequired
    };

    constructor(props) {
        super(props);

        this.zoomableImages = {};

        const currentFile = props.files.findIndex((file) => file.id === props.fileId);
        this.state = {
            currentFile,
            deviceHeight: deviceHeight - STATUSBAR_HEIGHT,
            deviceWidth,
            drag: new Animated.ValueXY(),
            footerOpacity: new Animated.Value(1),
            pagingEnabled: true,
            showFileInfo: true,
            wrapperViewOpacity: new Animated.Value(0)
        };
    }

    componentWillMount() {
        this.mainViewPanResponder = PanResponder.create({
            onMoveShouldSetPanResponderCapture: this.mainViewMoveShouldSetPanResponderCapture,
            onPanResponderMove: Animated.event([null, {
                dx: 0,
                dy: this.state.drag.y
            }]),
            onPanResponderRelease: this.mainViewPanResponderRelease,
            onPanResponderTerminate: this.mainViewPanResponderRelease
        });
    }

    componentDidMount() {
        Orientation.unlockAllOrientations();
        InteractionManager.runAfterInteractions(() => {
            this.scrollView.scrollTo({x: (this.state.currentFile) * this.state.deviceWidth, animated: false});
            Animated.timing(this.state.wrapperViewOpacity, {
                toValue: 1,
                duration: 100
            }).start();
        });
    }

    componentWillUnmount() {
        Orientation.lockToPortrait();
        if (Platform.OS === 'ios') {
            StatusBar.setHidden(false, 'fade');
        }
    }

    close = () => {
        this.props.navigator.dismissModal({animationType: 'none'});
    };

    mainViewMoveShouldSetPanResponderCapture = (evt, gestureState) => {
        if (gestureState.numberActiveTouches === 2 || this.state.isZooming) {
            return false;
        }

        const {dx, dy} = gestureState;
        const isVerticalDrag = Math.abs(dy) > DRAG_VERTICAL_THRESHOLD_START && dx < DRAG_HORIZONTAL_THRESHOLD;
        if (isVerticalDrag) {
            this.setHeaderAndFileInfoVisible(false);
            return true;
        }

        return false;
    };

    mainViewPanResponderRelease = (evt, gestureState) => {
        if (Math.abs(gestureState.dy) > DRAG_VERTICAL_THRESHOLD_END) {
            this.close();
        } else {
            this.setHeaderAndFileInfoVisible(true);
            Animated.spring(this.state.drag, {
                toValue: {x: 0, y: 0}
            }).start();
        }
    };

    handleClose = () => {
        if (this.state.showFileInfo) {
            this.close();
        }
    };

    handleImageTap = () => {
        this.hideDownloader(false);
        this.setHeaderAndFileInfoVisible(!this.state.showFileInfo);
    };

    handleImageDoubleTap = (x, y) => {
        this.zoomableImages[this.state.currentFile].toggleZoom(x, y);
    }

    setHeaderAndFileInfoVisible = (show) => {
        this.setState({
            showFileInfo: show
        });

        if (Platform.OS === 'ios') {
            StatusBar.setHidden(!show, 'fade');
        }

        const opacity = show ? 1 : 0;

        Animated.timing(this.state.footerOpacity, {
            toValue: opacity,
            duration: 300
        }).start();
    };

    handleScroll = (event) => {
        const offset = event.nativeEvent.contentOffset.x / this.state.deviceWidth;
        const wholeNumber = Number((offset).toFixed(0));
        if (Math.abs(offset - wholeNumber) < 0.01) {
            this.setState({
                currentFile: wholeNumber,
                pagingEnabled: true,
                shouldShrinkImages: false
            });
        } else if (!this.state.shouldShrinkImages && !this.state.isZooming) {
            this.setState({
                shouldShrinkImages: true
            });
        }
    };

    attachScrollView = (c) => {
        this.scrollView = c;
    };

    onLayout = (event) => {
        if (event.nativeEvent.layout.width !== this.state.deviceWidth) {
            this.setState({
                deviceHeight: event.nativeEvent.layout.height,
                deviceWidth: event.nativeEvent.layout.width
            });
        }
    };

    imageIsZooming = (zooming) => {
        if (zooming !== this.state.isZooming) {
            this.setHeaderAndFileInfoVisible(!zooming);
            this.setState({
                isZooming: zooming
            });
        }
    };

    showDownloadOptions = () => {
        if (Platform.OS === 'android') {
            if (this.state.showDownloader) {
                this.hideDownloader();
            } else {
                this.showDownloader();
            }
        } else {
            this.showIOSDownloadOptions();
        }
    }

    showIOSDownloadOptions = () => {
        this.setHeaderAndFileInfoVisible(false);

        const options = {
            title: this.props.files[this.state.currentFile].name,
            items: [{
                action: this.showDownloader,
                text: {
                    id: 'mobile.image_preview.save',
                    defaultMessage: 'Save Image'
                }
            }],
            onCancelPress: () => this.setHeaderAndFileInfoVisible(true)
        };

        this.props.navigator.showModal({
            screen: 'OptionsModal',
            title: '',
            animationType: 'none',
            passProps: {
                ...options
            },
            navigatorStyle: {
                navBarHidden: true,
                statusBarHidden: false,
                statusBarHideWithNavBar: false,
                screenBackgroundColor: 'transparent',
                modalPresentationStyle: 'overCurrentContext'
            }
        });
    }

    showDownloader = () => {
        EventEmitter.emit(NavigationTypes.NAVIGATION_CLOSE_MODAL);

        this.setState({
            showDownloader: true
        });
    }

    hideDownloader = (hideFileInfo = true) => {
        this.setState({showDownloader: false});
        if (hideFileInfo) {
            this.setHeaderAndFileInfoVisible(true);
        }
    }

    renderDownloadButton = () => {
        const {canDownloadFiles, files} = this.props;
        const file = files[this.state.currentFile];

        let icon;
        let action = emptyFunction;
        if (canDownloadFiles) {
            if (Platform.OS === 'android') {
                action = this.showDownloadOptions;
                icon = (
                    <Icon
                        name='md-more'
                        size={32}
                        color='#fff'
                    />
                );
            } else if (file.has_preview_image) {
                action = this.showDownloadOptions;
                icon = (
                    <Icon
                        name='ios-download-outline'
                        size={26}
                        color='#fff'
                    />
                );
            }
        }

        return (
            <TouchableOpacity
                onPress={action}
                style={style.headerIcon}
            >
                {icon}
            </TouchableOpacity>
        );
    }

    render() {
        const maxImageHeight = this.state.deviceHeight - STATUSBAR_HEIGHT;

        const marginStyle = {
            ...Platform.select({
                ios: {
                    marginTop: this.props.statusBarHeight
                },
                android: {
                    marginTop: 10
                }
            })
        };

        return (
            <View
                style={[style.wrapper, {height: this.state.deviceHeight, width: this.state.deviceWidth}]}
                onLayout={this.onLayout}
            >
                <AnimatedView
                    style={[this.state.drag.getLayout(), {opacity: this.state.wrapperViewOpacity}]}
                    {...this.mainViewPanResponder.panHandlers}
                >
                    <ScrollView
                        ref={this.attachScrollView}
                        style={[style.ScrollView]}
                        contentContainerStyle={style.scrollViewContent}
                        scrollEnabled={!this.state.isZooming}
                        horizontal={true}
                        pagingEnabled={!this.state.isZooming}
                        bounces={false}
                        onScroll={this.handleScroll}
                        scrollEventThrottle={2}

                    >
                        {this.props.files.map((file, index) => {
                            let component;
                            if (file.has_preview_image) {
                                component = (
                                    <Previewer
                                        ref={(c) => {
                                            this.zoomableImages[index] = c;
                                        }}
                                        addFileToFetchCache={this.props.actions.addFileToFetchCache}
                                        fetchCache={this.props.fetchCache}
                                        file={file}
                                        theme={this.props.theme}
                                        imageHeight={Math.min(maxImageHeight, file.height)}
                                        imageWidth={Math.min(this.state.deviceWidth, file.width)}
                                        shrink={this.state.shouldShrinkImages}
                                        wrapperHeight={this.state.deviceHeight}
                                        wrapperWidth={this.state.deviceWidth}
                                        onImageTap={this.handleImageTap}
                                        onImageDoubleTap={this.handleImageDoubleTap}
                                        onZoom={this.imageIsZooming}
                                    />
                                );
                            } else {
                                component = (
                                    <FileAttachmentIcon
                                        file={file}
                                        theme={this.props.theme}
                                        iconHeight={120}
                                        iconWidth={120}
                                        wrapperHeight={200}
                                        wrapperWidth={200}
                                    />
                                );
                            }

                            return (
                                <View
                                    key={file.id}
                                    style={[style.pageWrapper, {height: this.state.deviceHeight, width: this.state.deviceWidth}]}
                                >
                                    {component}
                                </View>
                            );
                        })}
                    </ScrollView>
                    <AnimatedView
                        style={[style.footerHeaderWrapper, {height: this.state.deviceHeight, width: this.state.deviceWidth, opacity: this.state.footerOpacity}]}
                        pointerEvents='box-none'
                    >
                        <View style={style.header}>
                            <View style={[style.headerControls, marginStyle]}>
                                <TouchableOpacity
                                    onPress={this.handleClose}
                                    style={style.headerIcon}
                                >
                                    <Icon
                                        name='md-close'
                                        size={26}
                                        color='#fff'
                                    />
                                </TouchableOpacity>
                                <Text style={style.title}>
                                    {`${this.state.currentFile + 1}/${this.props.files.length}`}
                                </Text>
                                {this.renderDownloadButton()}
                            </View>
                        </View>
                        <LinearGradient
                            style={style.footer}
                            start={{x: 0.0, y: 0.0}}
                            end={{x: 0.0, y: 0.9}}
                            colors={['transparent', '#000000']}
                            pointerEvents='none'
                        >
                            <Text style={style.filename}>
                                {this.props.files[this.state.currentFile].name}
                            </Text>
                        </LinearGradient>
                    </AnimatedView>
                </AnimatedView>
                <Downloader
                    show={this.state.showDownloader}
                    file={this.props.files[this.state.currentFile]}
                    onDownloadCancel={this.hideDownloader}
                    onDownloadStart={this.hideDownloader}
                    onDownloadSuccess={this.hideDownloader}
                />
            </View>
        );
    }
}

const style = StyleSheet.create({
    filename: {
        color: 'white',
        fontSize: 15
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 70,
        justifyContent: 'flex-end',
        paddingHorizontal: 24,
        paddingBottom: 16
    },
    footerHeaderWrapper: {
        position: 'absolute',
        bottom: 0,
        left: 0
    },
    header: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        height: HEADER_HEIGHT,
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%'
    },
    headerControls: {
        alignItems: 'center',
        justifyContent: 'space-around',
        flexDirection: 'row'
    },
    headerIcon: {
        height: 44,
        width: 48,
        alignItems: 'center',
        justifyContent: 'center'
    },
    pageWrapper: {
        alignItems: 'center',
        justifyContent: 'center'
    },
    scrollView: {
        flex: 1,
        backgroundColor: '#000'
    },
    scrollViewContent: {
        backgroundColor: '#000'
    },
    title: {
        flex: 1,
        marginHorizontal: 10,
        color: 'white',
        fontSize: 15,
        textAlign: 'center'
    },
    wrapper: {
        position: 'absolute',
        top: 0,
        left: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)'
    }
});
