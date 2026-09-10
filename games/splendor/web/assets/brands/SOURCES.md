# AI 牌友图标来源

本目录四种图标原样复用扑克现有素材。GPT 使用 ChatGPT / OpenAI 图标；每局最多抽取三个 AI 牌友。

获取与核对日期：2026-09-09。

这些标识用于本项目的宝可梦 AI 牌友主题，角色行为与台词由游戏本地程序生成。它们不表示调用相应模型，不表示上述品牌制作、赞助、认可或授权本游戏。品牌名称、图案及相关商标仍归各自权利人所有。

## 本地文件与来源

| 角色 | 文件 | 来源说明 | 来源 URL | 品牌归属 |
|---|---|---|---|---|
| 豆包 | `doubao.png` | 豆包官网公开 favicon；官网首页 link 标签在 2026-09-09 指向此文件 | [源文件](https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/favicon/new-doubao/192x192.png) | 豆包 / 字节跳动 |
| ChatGPT | `chatgpt.svg` | LobeHub Icons 的 openai.svg；OpenAI 的结形品牌标识 | [源文件](https://unpkg.com/@lobehub/icons-static-svg@1.95.0/icons/openai.svg) | ChatGPT / OpenAI |
| Claude | `claude.svg` | LobeHub Icons 的 claude-color.svg | [源文件](https://unpkg.com/@lobehub/icons-static-svg@1.95.0/icons/claude-color.svg) | Claude / Anthropic |
| DeepSeek | `deepseek.svg` | LobeHub Icons 的 deepseek-color.svg | [源文件](https://unpkg.com/@lobehub/icons-static-svg@1.95.0/icons/deepseek-color.svg) | DeepSeek / 深度求索 |


## 使用与显示

- 文件保持下载原始字节，不重画、不变形、不替换品牌色。
- 推荐把图标放在白色或乳白色头像底板内，使用 `object-fit: contain`；保持图标宽高比和四周留白。
- `chatgpt.svg` 是图标库原始 `currentColor` 版本，通过 `<img>` 显示为黑色，适合浅底；不要用 CSS filter 改色。
- SVG 已解析检查：无脚本、事件处理器、foreignObject、嵌入页面、外部图片或远程引用，只有本地矢量路径和可能的内部渐变引用。运行游戏时图标无需外网请求。

## 获取版本和校验

三份 SVG 来源于 `@lobehub/icons-static-svg@1.95.0` 的固定版本包，下载包：

https://registry.npmjs.org/@lobehub/icons-static-svg/-/icons-static-svg-1.95.0.tgz

已核对 npm 发布元数据给出的 SHA-512 完整性值。

| 文件 | SHA-256 |
|---|---|
| `doubao.png` | `dabb2abd94e3a6c11e7f1a42c9343839b6ef643c086751b71afbc68f615aec38` |
| `chatgpt.svg` | `a595df6b423920c67a7f8f73c063e4bfb72d415948097b6cac063a2366bb5186` |
| `claude.svg` | `a3101f3047a119aa11825ad9369510f0c472428c8c52d420e31bc62db44a8364` |
| `deepseek.svg` | `deba5f98a5c1796e20fcac3149bcd7eb8a32f0bdd04d048819400b1f28bd1439` |

## 许可证与商标

LobeHub 图标集合代码按照 MIT License 分发，许可证见 [LobeHub 仓库](https://github.com/lobehub/lobe-icons/blob/master/LICENSE)。MIT 授权不转移图中品牌商标的权利，也不构成品牌背书。下方保留图标集合版权声明及许可全文。

豆包 PNG 来自官网公开 favicon；官网没有在该文件中附带独立开源许可证，本项目不把它声明为 MIT 授权资产。其版权与商标权仍归相应权利人。

```text
MIT License

Copyright (c) 2023 LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
