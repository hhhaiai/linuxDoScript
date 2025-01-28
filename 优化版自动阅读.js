// ==UserScript==
// @name         优化版自动阅读
// @namespace    http://tampermonkey.net/
// @version      2.2.0
// @description  优化版自动阅读脚本，增加页面错误自动重新加载功能
// @author       liuweiqing
// @match        https://meta.discourse.org/*
// @match        https://linux.do/*
// @match        https://meta.appinn.net/*
// @match        https://community.openai.com/
// @grant        none
// @license      MIT
// @icon         https://www.google.com/s2/favicons?domain=linux.do
// ==/UserScript==

// 主自执行函数
(function() {
    'use strict';

    // 配置对象，包含网站信息、滚动设置、限制和重载设置
    const CONFIG = {
        sites: {
            // 允许访问的基础 URL 列表
            possibleBaseURLs: [
                "https://linux.do",
                "https://meta.discourse.org",
                "https://meta.appinn.net",
                "https://community.openai.com"
            ]
        },
        scroll: {
            step: 30, // 每次滚动的像素数
            interval: 30, // 滚动间隔时间（毫秒）
            bottomThreshold: 200 // 检测底部的阈值
        },
        limits: {
            comment: 1000, // 允许的最大评论数
            topicList: 100, // 获取的最大主题列表
            like: 50 // 最大点赞次数
        },
        reload: {
            errorSelector: 'body:contains("崩溃啦")', // 检测错误页面的关键内容
            buttonSelector: 'button:contains("重新加载")', // 重新加载按钮选择器
            checkInterval: 3000 // 检测页面错误的间隔时间（毫秒）
        }
    };

    // 定义主要的自动阅读类
    class AutoReader {
        constructor() {
            // 初始化状态
            this.state = {
                isReading: false, // 当前是否在阅读
                isLiking: false, // 当前是否在点赞
                currentTopicList: [], // 当前话题列表
                clickCounter: 0 // 当前点赞计数
            };

            // 定义定时器和其他变量
            this.scrollInterval = null; // 滚动定时器
            this.checkScrollTimeout = null; // 检查滚动的超时
            this.errorCheckInterval = null; // 页面错误检测间隔
            this.BASE_URL = this.determineBaseURL(); // 确定基础 URL

            this.init(); // 初始化设置
        }

        // 确定当前页面的基础 URL
        determineBaseURL() {
            const currentURL = window.location.href; // 获取当前 URL
            // 找到匹配的基础 URL，若没有则返回默认值
            return CONFIG.sites.possibleBaseURLs.find(url =>
                currentURL.startsWith(url)) || CONFIG.sites.possibleBaseURLs[0];
        }

        // 初始化设置
        init() {
            this.checkFirstRun(); // 检查是否第一次运行
            this.loadState(); // 加载状态信息
            this.createControls(); // 创建用户界面控件
            this.setupAutoLike(); // 设置自动点赞功能
            this.startErrorCheck(); // 开始页面错误检测

            // 如果正在阅读，则开始滚动
            if (this.state.isReading) {
                this.startScrolling();
            }
        }

        // 检查是否第一次运行
        checkFirstRun() {
            if (localStorage.getItem("isFirstRun") === null) {
                // 设置默认状态
                localStorage.setItem("read", "false"); // 默认不阅读
                localStorage.setItem("autoLikeEnabled", "false"); // 默认不点赞
                localStorage.setItem("isFirstRun", "false"); // 标记为已运行
            }
        }

        // 加载本地存储中的状态
        loadState() {
            // 从本地存储中获取阅读状态和点赞状态
            this.state.isReading = localStorage.getItem("read") === "true"; // 是否正在阅读
            this.state.isLiking = localStorage.getItem("autoLikeEnabled") === "true"; // 是否开启点赞
            this.state.clickCounter = parseInt(localStorage.getItem("clickCounter") || "0", 10); // 获取点赞计数

            const topicListStr = localStorage.getItem("topicList"); // 获取当前话题列表
            this.state.currentTopicList = topicListStr ? JSON.parse(topicListStr) : []; // 更新当前话题列表
        }

        // 开始自动滚动页面
        startScrolling() {
            // 如果已有滚动定时器，清除它
            if (this.scrollInterval) {
                clearInterval(this.scrollInterval);
            }

            // 设置新的滚动定时器
            this.scrollInterval = setInterval(() => {
                window.scrollBy({
                    top: CONFIG.scroll.step, // 向下滚动指定的像素数
                    behavior: 'auto' // 滚动行为
                });
            }, CONFIG.scroll.interval); // 每次滚动的间隔时间

            this.checkScroll(); // 检查当前滚动状态
        }

        // 检查是否到达页面底部
        checkScroll() {
            // 如果不在阅读状态，结束
            if (!this.state.isReading) return;

            // 检测是否到达页面底部
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - CONFIG.scroll.bottomThreshold) {
                console.log("到达底部，准备切换文章");
                this.openNewTopic(); // 打开新话题
            } else {
                // 如果尚未到达底部，设置超时以再次检查
                if (this.checkScrollTimeout) {
                    clearTimeout(this.checkScrollTimeout); // 清除已有的超时
                }
                // 延时500ms后再检查滚动状态
                this.checkScrollTimeout = setTimeout(() => this.checkScroll(), 500);
            }
        }

        // 开始页面错误检测
        startErrorCheck() {
            // 设置定时器定期检查页面错误
            this.errorCheckInterval = setInterval(() => {
                const errorDetected = document.querySelector(CONFIG.reload.errorSelector); // 检测错误内容
                const reloadButton = document.querySelector(CONFIG.reload.buttonSelector); // 检测重新加载按钮

                // 如果检测到错误，则自动点击重新加载
                if (errorDetected && reloadButton) {
                    console.log("检测到错误页面，尝试重新加载...");
                    reloadButton.click(); // 点击重新加载按钮
                }
            }, CONFIG.reload.checkInterval); // 检查间隔
        }

        // 获取最新的话题
        async getLatestTopics() {
            let page = 1; // 初始化页码
            let topicList = []; // 初始化话题数组

            // 循环获取话题，直到达到限制
            while (topicList.length < CONFIG.limits.topicList) {
                try {
                    const response = await fetch(
                        `${this.BASE_URL}/latest.json?no_definitions=true&page=${page}` // 请求最新话题
                    );
                    const data = await response.json(); // 解析 JSON 数据

                    // 检查是否有话题
                    if (!data?.topic_list?.topics?.length) break;

                    // 过滤出有效话题
                    const validTopics = data.topic_list.topics.filter(
                        topic => CONFIG.limits.comment > topic.posts_count // 过滤掉发表超过限制评论的主题
                    );
                    topicList.push(...validTopics); // 添加有效话题
                    page++; // 页码自增
                } catch (error) {
                    console.error('获取话题失败:', error); // 发生错误则打印错误信息
                    break; // 发生错误则结束循环
                }
            }

            // 更新当前话题列表并保存到本地存储
            this.state.currentTopicList = topicList.slice(0, CONFIG.limits.topicList);
            localStorage.setItem("topicList", JSON.stringify(this.state.currentTopicList)); // 保存更新后的话题列表
        }

        // 打开新的话题
        async openNewTopic() {
            // 如果当前话题列表为空，则获取最新话题
            if (this.state.currentTopicList.length === 0) {
                await this.getLatestTopics(); // 异步获取最新话题
            }

            // 如果有可用话题，则打开
            if (this.state.currentTopicList.length > 0) {
                const topic = this.state.currentTopicList.shift(); // 移除并获取第一个话题
                localStorage.setItem("topicList", JSON.stringify(this.state.currentTopicList)); // 保存更新后的话题列表

                // 构建 URL 以打开话题
                const url = topic.last_read_post_number
                    ? `${this.BASE_URL}/t/topic/${topic.id}/${topic.last_read_post_number}` // 带有最后阅读帖子编号的链接
                    : `${this.BASE_URL}/t/topic/${topic.id}`; // 直接链接到话题

                window.location.href = url; // 跳转到话题页面
            }
        }

        // 切换阅读状态
        toggleReading() {
            this.state.isReading = !this.state.isReading; // 切换状态
            localStorage.setItem("read", this.state.isReading.toString()); // 保存状态

            // 根据状态决定是否开始滚动
            if (this.state.isReading) {
                this.startScrolling(); // 开始滚动
            } else {
                // 清除滚动定时器和超时
                if (this.scrollInterval) {
                    clearInterval(this.scrollInterval);
                    this.scrollInterval = null;
                }
                if (this.checkScrollTimeout) {
                    clearTimeout(this.checkScrollTimeout);
                    this.checkScrollTimeout = null;
                }
            }

            this.updateButtonText(); // 更新按钮文本
        }

        // 创建控制按钮
        createControls() {
            // 定义按钮样式
            const buttonStyles = {
                position: 'fixed',
                right: '10px',
                zIndex: '1000',
                background: 'linear-gradient(90deg, black, white, yellow)', // 按钮背景样式
                color: '#000', // 按钮字体颜色
                border: '1px solid #ddd', // 按钮边框
                padding: '5px 10px', // 按钮内边距，较小
                borderRadius: '5px', // 按钮圆角，较小
                cursor: 'pointer', // 鼠标悬停时变为手型
                fontSize: '12px', // 按钮字体大小，较小
                textAlign: 'center', // 字体居中
                boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.2)', // 按钮阴影
                fontWeight: 'bold' // 字体加粗
            };

            // 创建阅读按钮
            const readButton = document.createElement("button");
            this.readButton = readButton; // 引用到类属性，方便后续更新

            readButton.textContent = this.state.isReading ? "停止阅读" : "开始阅读"; // 设置初始文本
            Object.assign(readButton.style, {
                ...buttonStyles,
                top: '40%' // 按钮垂直位置
            });

            // 绑定按钮点击事件
            readButton.onclick = () => this.toggleReading(); // 切换阅读状态
            document.body.appendChild(readButton); // 添加按钮到页面

            // 创建点赞按钮
            const likeButton = document.createElement("button");
            this.likeButton = likeButton; // 引用到类属性，方便后续更新

            likeButton.textContent = this.state.isLiking ? "停止点赞" : "开始点赞"; // 设置初始文本
            Object.assign(likeButton.style, {
                ...buttonStyles,
                top: '45%' // 按钮垂直位置
            });

            // 绑定点赞按钮点击事件
            likeButton.onclick = () => this.toggleAutoLike(); // 切换点赞状态
            document.body.appendChild(likeButton); // 添加按钮到页面
        }

        // 更新按钮文本
        updateButtonText() {
            // 更新阅读按钮文本
            if (this.readButton) {
                this.readButton.textContent = this.state.isReading ? "停止阅读" : "开始阅读";
            }
            // 更新点赞按钮文本
            if (this.likeButton) {
                this.likeButton.textContent = this.state.isLiking ? "停止点赞" : "开始点赞";
            }
        }

        // 设置自动点赞
        setupAutoLike() {
            // 如果已开启点赞，则开始自动点赞
            if (this.state.isLiking) {
                this.startAutoLike(); // 开始自动点赞
            }
        }

        // 切换自动点赞状态
        toggleAutoLike() {
            this.state.isLiking = !this.state.isLiking; // 切换状态
            localStorage.setItem("autoLikeEnabled", this.state.isLiking.toString()); // 保存状态

            // 根据状态决定是否开始自动点赞
            if (this.state.isLiking) {
                this.startAutoLike(); // 开始自动点赞
            }

            this.updateButtonText(); // 更新按钮文本
        }

        // 开始自动点赞功能
        async startAutoLike() {
            // 如果达到点赞限制，直接退出
            if (this.state.clickCounter >= CONFIG.limits.like) return;

            // 查询所有可点赞的按钮
            const buttons = Array.from(
                document.querySelectorAll('.discourse-reactions-reaction-button') // 获取所有点赞按钮
            ).filter(button =>
                ['点赞此帖子', 'Like this post'].includes(button.title) // 过滤出符合条件的按钮
            );

            // 遍历每个按钮进行点赞
            for (const button of buttons) {
                // 如果状态已变更或达到点赞限制则退出
                if (!this.state.isLiking || this.state.clickCounter >= CONFIG.limits.like) break;

                try {
                    await new Promise(resolve => setTimeout(resolve, 3000)); // 等待3秒再点赞
                    button.click(); // 点击点赞按钮
                    this.state.clickCounter++; // 点赞计数加一
                    localStorage.setItem("clickCounter", this.state.clickCounter.toString()); // 保存点赞计数
                } catch (error) {
                    console.error('点赞失败:', error); // 打印出错信息
                }
            }
        }
    }

    // 页面加载完成后初始化 AutoReader 实例
    // 如果页面仍在加载中，则添加事件监听器
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new AutoReader()); // 加载完成后实例化
    } else {
        new AutoReader(); // 如果已加载，直接实例化
    }
})();
