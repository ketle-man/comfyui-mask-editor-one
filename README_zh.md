# Mask Editor One

[English](README_en.md) | [日本語](README.md) | **中文**

ComfyUI 的分层模态蒙版编辑器。使用类似 Photoshop 的操作创建和编辑蒙版，输出 `IMAGE` 和 `MASK`。设计目标是在单个节点内完成所有蒙版操作。

![Mask Editor One](docs/3_mask_editor.png)

## 主要功能

- **模态编辑器** — 通过节点上的 `Edit Mask` 按钮在浏览器内启动编辑器
- **绘制工具** — 笔刷大小、硬度、间距、**角度**、添加/擦除模式。**大小抖动**（Amount 滑块控制最大缩减幅度）和**旋转抖动**（每次印章随机 0°–360°），各自通过复选框独立开关
- **颜色选择工具** — 容差/羽化调整，添加/减去模式
- **透明度提取工具** — 从输入图像的 Alpha 通道生成蒙版
- **文字工具** — 指定字体、大小、粗体/斜体、对齐方式，将文字形状作为蒙版放置
- **矢量工具** — 使用 Catmull-Rom 样条绘制平滑闭合路径
- **形状工具** — 拖动绘制矩形和椭圆。Shift+拖动从中心绘制正方形/正圆
- **SAM3 工具** — 文本提示 AI 分割（SAM3 / SAM3.1）。模型选择下拉菜单，候选蒙版缩略图，点击应用到图层
- **BiRefNet 去背景** — 一键生成前景蒙版。使用 ComfyUI 原生 `comfy.bg_removal_model`，无需额外库
- **所有工具共享模式切换** — 点击按钮即可切换 添加 / 擦除（或 添加 / 减去）
- **图层管理** — 添加、删除、切换显示、加减、拖动排序
- **撤销/重做** — 每图层 30 级
- **图像笔刷** — 使用灰度图像作为笔刷印章
- **笔刷库** — 文件夹树形 UI，PNG 文件夹导入，`.abr` 文件导入
- **蒙版反转开关** — 节点开关与编辑器 Invert 复选框双向联动
- **Photoshop 快速蒙版显示** — 显示图像时，整体叠加半透明颜色，绘制区域透明（Photoshop 快速蒙版风格）。叠加颜色可用颜色选择器自定义
- **模糊滤镜** — 通过节点组件和编辑器滑块调整高斯模糊（0–200 px），双向联动
- **BG 拖放区** — 点击或拖放图像文件到页脚 BG 区域设置背景图像，也支持拖放到画布区域
- **新建画布** — 通过工具栏 `📄 新建` 按钮指定宽高创建空白画布
- **节点预览** — 在节点上直接预览所选背景图像和应用后的蒙版
- **图像/蒙版切换** — 在节点上切换图像预览和蒙版预览
- **输入支持** — `IMAGE` / `MASK` 输入（均可选）
- **画布外拖动** — 绘制时鼠标超出画布边缘也能继续（可选择到图像边缘）
- **i18n 多语言** — 通过页脚语言选择器切换英语、日语、中文。设置保存到 `localStorage`

## 安装

将此文件夹放置在 ComfyUI 的 `custom_nodes/` 目录下：

```
ComfyUI/
└── custom_nodes/
    └── comfyui-mask-editor/
        ├── __init__.py
        ├── nodes.py
        ├── server.py
        ├── abr_parser.py
        ├── sam3_inference.py
        ├── birefnet_inference.py
        ├── requirements.txt
        └── web/
```

安装依赖：

```bash
pip install -r requirements.txt
```

### SAM3 模型设置（可选）

使用 SAM3 工具时，将 SAM3 检查点放置在 `ComfyUI/models/sam3/`：

```
ComfyUI/
└── models/
    └── sam3/
        ├── sam3.pt                              # SAM3（推荐）
        ├── sam3.safetensors                     # SAM3 safetensors 格式
        ├── sam3.1_multiplex.pt                  # SAM3.1
        └── sam3.1_multiplex_fp16.safetensors    # SAM3.1 FP16 safetensors
```

- 支持 `.pt` / `.pth` / `.safetensors`。多文件时可通过下拉菜单选择
- TorchScript/JIT 格式文件（`torch.jit.save`）自动跳过
- 文件名不含 `sam3` 的文件不会显示在列表中
- 未找到检查点时，自动尝试从 HuggingFace（facebook/sam3）下载

### BiRefNet 模型设置（可选）

使用 BiRefNet 去背景工具时，将模型放置在 `ComfyUI/models/background_removal/`：

```
ComfyUI/
└── models/
    └── background_removal/
        └── birefnet.safetensors    # 或 BiRefNet.safetensors / BiRefNet-general.safetensors
```

- 从 HuggingFace `zhengpeng7/BiRefNet` 下载
- 使用 ComfyUI 内置的 `comfy.bg_removal_model`，无需额外安装库
- 文件不存在时，工具面板会显示错误。运行推理前不会加载模型

重启 ComfyUI，节点将出现在 `image/masking` 分类下，名称为 **Mask Editor One**。

## 使用方法

### 基本操作

<img src="docs/4_menu.png" width="110" align="right" alt="工具侧边栏">

1. 将 `Mask Editor One` 节点添加到工作流
2. （可选）连接 `IMAGE` / `MASK` 输入
3. 点击节点上的 `Edit Mask` 按钮 → 打开模态编辑器
4. 从左侧边栏选择工具绘制蒙版
5. 点击 `Apply` 确认 → 运行节点即可在 `image` / `mask` 输出中看到结果

### 节点选项

| 输入 | 说明 |
|------|------|
| `invert_mask` | 反转输出蒙版（黑↔白）。与编辑器 Invert 复选框双向联动 |
| `blur_radius` | 输出蒙版的高斯模糊半径（0–200 px）。与编辑器滑块双向联动 |
| `image` | 输入图像（可选）。连接时优先于 BG 按钮图像 |
| `mask` | 输入蒙版（可选） |
| `layer_data` | 编辑器状态 JSON（通常自动更新） |

### 节点 BG 按钮

| 操作 | 效果 |
|------|------|
| 点击 `🖼 背景` | 打开文件选择对话框。选择后变为 `🖼 背景 ✕` |
| 点击 `🖼 背景 ✕` | 清除已选背景图像 |
| 点击 `👁 显示: 图像` | 将节点预览切换为蒙版显示 |
| 点击 `👁 显示: 蒙版` | 将节点预览切换为图像显示 |

- `image` 输入已连接时优先使用连接图像；断开后使用 BG 按钮图像
- Apply 后自动切换为蒙版预览，节点上显示黑白蒙版
- 编辑器**打开时**更换背景请使用编辑器页脚的 `🖼 背景` 按钮

<p>
  <img src="docs/1_node.png" width="220" alt="节点 — 图像预览">
  <img src="docs/2_node_mask.png" width="220" alt="节点 — 蒙版预览">
</p>

### 文字工具

1. 在工具栏选择 **T（文字）**
2. 在右侧面板设置文字、字体、大小、粗体/斜体、对齐方式和模式
3. 点击画布 → 显示文字输入叠加层
4. 输入文字后点击 **Stamp** 或按 `Ctrl+Enter` 确认，`Esc` 取消

| 选项 | 说明 |
|------|------|
| Text | 要印章的文字（支持换行多行） |
| Font | 字体系列（Arial、Georgia、Impact 等 11 种） |
| Size | 字体大小（8–400 px） |
| Style | **B**（粗体）/ *I*（斜体） |
| Align | 左对齐 / 居中 / 右对齐 |
| Mode | **添加** / **擦除** |

### 矢量工具

1. 在工具栏选择 **✦（矢量）**
2. 点击画布添加锚点（黄色点）
3. 移动鼠标实时预览路径
4. **闭合路径**：点击第一个点（变红时）闭合并填充
5. **开放路径**：按 `Enter` 确认（可撤销）

| 快捷键 | 操作 |
|--------|------|
| 点击 | 添加锚点 |
| 点击第一个点 | 闭合路径并确认 |
| `Enter` | 确认开放路径 |
| `Backspace` / `Delete` | 删除最后一个锚点 |
| `Esc` | 重置路径 |

样条使用 **Catmull-Rom → 贝塞尔转换**，自动生成经过所有锚点的平滑曲线。

### 形状工具

1. 在工具栏选择 **⬜（形状）**
2. 在右侧面板选择形状（矩形/椭圆）和模式（添加/擦除）
3. 在画布上拖动绘制

| 操作 | 效果 |
|------|------|
| 拖动 | 以起点和终点为对角绘制矩形/椭圆 |
| `Shift` + 拖动 | 以起点为**中心**绘制正方形/正圆 |

拖动时显示蓝色虚线实时预览。

### SAM3 工具

1. 在工具栏选择 **✨（SAM3）**
2. 从 **Model** 下拉菜单选择检查点（`models/sam3/` 中的有效文件；仅一个时隐藏）
3. 输入提示词并点击 **Segment** 或按 `Enter` 执行推理
4. 候选蒙版缩略图按分数排序显示
5. 点击缩略图将其应用到当前图层

| 选项 | 说明 |
|------|------|
| Model | 使用的检查点文件名 |
| Prompt | 用英语指定分割目标（如 "dog"、"red ball"） |
| Mode | 添加（白色绘制）/ 擦除（清除蒙版区域） |

### BiRefNet 去背景工具

1. 在工具栏选择 **🔲（去背景）**
2. 查看右侧面板状态（模型就绪时显示"Model found"）
3. 点击 **Remove BG** → BiRefNet 自动生成前景蒙版并应用到当前图层
4. 通过 **Mode** 选择结果的应用方式

| 选项 | 说明 |
|------|------|
| Mode | 添加（前景添加为白色蒙版）/ 擦除（从蒙版中擦除前景区域） |

- 首次加载时（约 1–3 秒）按钮禁用并显示加载动画
- 推理期间按钮也禁用。完成后自动应用到图层

### 绘制工具

笔刷渲染与 Photoshop 兼容：

- **Hardness（硬度）** — 控制不透明核心的半径。`100%` 为锐利边缘，`0%` 为全柔化
- **Spacing（间距）** — 印章间隔（相对笔刷大小的比例）
- **Angle（角度）** — 图像笔刷的旋转角度
- **Size Jitter（大小抖动）** — 复选框启用。每次印章随机缩小笔刷大小。**Amount** 滑块（0–100%）设置最大缩减幅度（50% → 随机 50%–100%）
- **Rotation Jitter（旋转抖动）** — 复选框启用。每次印章随机旋转 0°–360°。配合图像笔刷效果最佳
- **保持宽高比** — 图像笔刷印章保持源图像比例（`brushSize` 为高度，宽度自动计算）
- **无笔画内累积** — 同一笔画内重叠的印章使用 `lighten`（取最大值），防止过度堆叠

### 笔刷库

选择绘制工具时，通过 `Browse Brushes…` 按钮打开笔刷库。

![笔刷库](docs/5_brush_library.png)

- **Import Folder** — 递归导入包含 PNG/JPG/WebP/BMP 的文件夹
- **Import .ABR** — 导入 Photoshop `.abr` 笔刷文件（见下文）

笔刷保存在 `custom_nodes/comfyui-mask-editor/brushes/` 下。  
缩略图以深色背景显示白色笔刷形状（与 Photoshop 笔刷预览相同风格）。

### 导入 ABR 笔刷

支持版本：

| 版本 | 状态 |
|------|------|
| ABR v1 (Photoshop 5) | ✅ |
| ABR v2 non-sub6 (Photoshop 5.5–7，块长度格式) | ✅ 支持 Unicode 笔刷名称 |
| ABR v2 sub6 / v6 (Photoshop 7+) | ✅ ActionDescriptor 解析 |
| ABR v6 UUID-keyed samp (Photoshop CC+) | ✅ 画布边界定点数解析 |
| ABR v6 Atenais 格式（05_Flames 等） | ✅ offset 320 BE u16 行计数表 + PackBits |
| ABR v10 | ✅ |

导入的笔刷保存为 **RGBA PNG**：
- `RGB = (255, 255, 255)` 白色固定
- `A = 笔刷密度`（越亮越不透明 = 绘制越强）

> **关于重新导入笔刷**  
> 如果保存格式已更改，请先从笔刷库删除相关文件夹，再重新导入 ABR。

## 架构

```
comfyui-mask-editor/
├── nodes.py              # MaskEditorOne（处理/图层合成）
├── server.py             # PromptServer API（图像缓存、笔刷、SAM3、BiRefNet 端点）
├── abr_parser.py         # ABR 文件解析器
├── sam3_inference.py     # SAM3 推理后端
├── birefnet_inference.py # BiRefNet 去背景后端
└── web/
    ├── css/maskEditor.css
    └── js/
        ├── maskEditor.js              # ComfyUI 扩展入口
        └── editor/
            ├── MaskEditorModal.js     # 完整模态 UI
            ├── CanvasCompositor.js    # 图层合成
            ├── LayerManager.js        # 图层管理（撤销/重做）
            ├── BrushLibrary.js        # 笔刷库 UI
            ├── i18n.js               # 翻译（en/ja/zh）
            └── tools/
                ├── BaseTool.js
                ├── PaintTool.js        # 绘制工具
                ├── ColorTool.js        # 颜色选择
                ├── TransparencyTool.js # Alpha → 蒙版
                ├── TextTool.js         # 文字形状蒙版
                ├── VectorTool.js       # Catmull-Rom 样条矢量
                ├── ShapeTool.js        # 矩形/椭圆形状
                ├── Sam3Tool.js         # SAM3.1 AI 分割
                └── BiRefNetTool.js     # BiRefNet 去背景
```

### API 端点

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/mask_editor/get_node_image` | 通过节点 ID 获取图像/蒙版 |
| POST | `/mask_editor/store_image` | 从浏览器缓存图像 |
| POST | `/mask_editor/save_result` | 保存图层数据 |
| GET | `/mask_editor/brushes/list` | 笔刷文件夹树 |
| GET | `/mask_editor/brushes/raw?path=…` | 提供笔刷图像 |
| POST | `/mask_editor/brushes/import` | 导入 PNG 文件夹 |
| POST | `/mask_editor/brushes/upload_abr` | 导入 ABR 文件 |
| GET | `/mask_editor/sam3/status` | SAM3 加载状态和可用模型列表 |
| POST | `/mask_editor/sam3/segment` | 使用文本提示运行分割 |
| GET | `/mask_editor/birefnet/status` | BiRefNet 加载状态和模型文件是否存在 |
| POST | `/mask_editor/birefnet/remove_bg` | 运行去背景，返回前景蒙版 PNG |

## 调试

启用详细日志：

```python
import logging
logging.getLogger("abr_parser").setLevel(logging.DEBUG)
logging.getLogger("server").setLevel(logging.DEBUG)
```

调查笔刷导入问题时请查看 ComfyUI 终端日志。

## 许可证

MIT License — 详情请参阅 [LICENSE](LICENSE)。

## 致谢

- [SAM3 / SAM 3.1](https://huggingface.co/facebook/sam3) (Meta FAIR) — 文本提示 AI 分割模型 (Apache-2.0)
- [BiRefNet](https://huggingface.co/zhengpeng7/BiRefNet) (ZhengPeng7) — 背景去除模型 (MIT)，通过 ComfyUI 原生 `comfy.bg_removal_model` 调用  
  Zheng et al., "Bilateral Reference for High-Resolution Dichotomous Image Segmentation", *CAAI AIR* 2024
