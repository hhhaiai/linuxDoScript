// ==UserScript==
// @name         Linux.do 下崽器 (新版)
// @namespace    http://linux.do/
// @version      1.0.7
// @description  备份你珍贵的水贴为Markdown，可拖拽调整按钮位置。
// @author       PastKing
// @match        https://www.linux.do/t/topic/*
// @match        https://linux.do/t/topic/*
// @license      MIT
// @icon         https://cdn.linux.do/uploads/default/optimized/1X/3a18b4b0da3e8cf96f7eea15241c3d251f28a39b_2_32x32.png
// @grant        none
// @require      https://unpkg.com/turndown@7.1.3/dist/turndown.js
// @downloadURL https://update.greasyfork.org/scripts/511622/Linuxdo%20%E4%B8%8B%E5%B4%BD%E5%99%A8%20%28%E6%96%B0%E7%89%88%29.user.js
// @updateURL https://update.greasyfork.org/scripts/511622/Linuxdo%20%E4%B8%8B%E5%B4%BD%E5%99%A8%20%28%E6%96%B0%E7%89%88%29.meta.js
// ==/UserScript==

(function() {
    'use strict';

    let isDragging = false;
    let isMouseDown = false;

    // 创建并插入下载按钮
    function createDownloadButton() {
        const button = document.createElement('button');
        button.textContent = '下载为 Markdown';
        button.style.cssText = `
            padding: 10px 15px;
            font-size: 14px;
            font-weight: bold;
            color: #ffffff;
            background-color: #0f9d58;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.3s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            position: fixed;
            z-index: 9999;
        `;

        // 添加悬停效果
        button.onmouseover = function() {
            this.style.backgroundColor = '#0b8043';
        };
        button.onmouseout = function() {
            this.style.backgroundColor = '#0f9d58';
        };

        // 从localStorage获取保存的位置
        const savedPosition = JSON.parse(localStorage.getItem('downloadButtonPosition'));
        if (savedPosition) {
            button.style.left = savedPosition.left;
            button.style.top = savedPosition.top;
        } else {
            button.style.right = '20px';
            button.style.bottom = '20px';
        }

        document.body.appendChild(button);

        return button;
    }

    // 添加拖拽功能
    function makeDraggable(element) {
        let startX, startY, startLeft, startTop;

        element.addEventListener('mousedown', startDragging);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDragging);

        function startDragging(e) {
            isMouseDown = true;
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(element.style.left) || window.innerWidth - parseInt(element.style.right) - element.offsetWidth;
            startTop = parseInt(element.style.top) || window.innerHeight - parseInt(element.style.bottom) - element.offsetHeight;
            e.preventDefault();
        }

        function drag(e) {
            if (!isMouseDown) return;
            isDragging = true;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            element.style.left = `${startLeft + dx}px`;
            element.style.top = `${startTop + dy}px`;
            element.style.right = 'auto';
            element.style.bottom = 'auto';
        }

        function stopDragging() {
            if (isMouseDown && isDragging) {
                localStorage.setItem('downloadButtonPosition', JSON.stringify({
                    left: element.style.left,
                    top: element.style.top
                }));
            }
            isMouseDown = false;
            setTimeout(() => {
                isDragging = false;
            }, 10); // 短暂延迟以确保点击事件在拖动后正确触发
        }
    }

    // 获取文章内容
    function getArticleContent() {
        const titleElement = document.querySelector('#topic-title > div > h1 > a.fancy-title > span');
        const contentElement = document.querySelector('#post_1 > div.row > div.topic-body.clearfix > div.regular.contents > div.cooked');

        if (!titleElement || !contentElement) {
            console.error('无法找到文章标题或内容');
            return null;
        }

        return {
            title: titleElement.textContent.trim(),
            content: contentElement.innerHTML
        };
    }

    // 转换为Markdown并下载
    function downloadAsMarkdown() {
        const article = getArticleContent();
        if (!article) {
            alert('无法获取文章内容，请检查网页结构是否变更。');
            return;
        }

        const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced'
        });

        // 自定义规则处理图片和链接
        turndownService.addRule('images_and_links', {
            filter: ['a', 'img'],
            replacement: function (content, node) {
                // 处理图片
                if (node.nodeName === 'IMG') {
                    const alt = node.alt || '';
                    const src = node.getAttribute('src') || '';
                    const title = node.title ? ` "${node.title}"` : '';
                    return `![${alt}](${src}${title})`;
                }
                // 处理链接
                else if (node.nodeName === 'A') {
                    const href = node.getAttribute('href');
                    const title = node.title ? ` "${node.title}"` : '';
                    // 检查链接是否包含图片
                    const img = node.querySelector('img');
                    if (img) {
                        const alt = img.alt || '';
                        const src = img.getAttribute('src') || '';
                        const imgTitle = img.title ? ` "${img.title}"` : '';
                        return `[![${alt}](${src}${imgTitle})](${href}${title})`;
                    }
                    // 普通链接
                    return `[${node.textContent}](${href}${title})`;
                }
            }
        });

        const markdown = `# ${article.title}\n\n${turndownService.turndown(article.content)}`;

        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${article.title}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // 主函数
    function main() {
        const downloadButton = createDownloadButton();
        makeDraggable(downloadButton);
        downloadButton.addEventListener('click', function(e) {
            if (!isDragging) {
                downloadAsMarkdown();
            }
        });
    }

    // 运行主函数
    main();
})();
