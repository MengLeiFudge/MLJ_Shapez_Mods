# 建筑图片来源

下表全部 PNG 为用户授权沿用的原文件，未修改像素。Shapez Industries 作者 Sense_101（参考版本 1.1.6）；SQ-X 作者 梦想天生（本地源码 metadata，版本 __dev__）。本地参考目录没有找到许可文件，本清单记录来源，不代表新增再分发许可；发布前由用户确认授权。

Shapez Industries 原目录：D:\project\shapez\shapez-industries\res\sprites\。SQ-X 原目录：D:\project\shapez\shapez-mods\SQ-X\sprites\。

| 本目录文件 | 来源模组 / 作者 | 原目录下的路径 | 尺寸 | 对应建筑 |
| --- | --- | --- | --- | --- |
| industries/merge.png | Shapez Industries / Sense_101 | buildings/balancer-smart-merger_all.png | 192×192 | 智能合并 |
| industries/merge-blueprint.png | Shapez Industries / Sense_101 | blueprints/balancer-smart-merger_all.png | 192×192 | 智能合并蓝图 |
| industries/split.png | Shapez Industries / Sense_101 | buildings/balancer-smart-splitter_all.png | 192×192 | 智能分离 |
| industries/split-blueprint.png | Shapez Industries / Sense_101 | blueprints/balancer-smart-splitter_all.png | 192×192 | 智能分离蓝图 |
| industries/crossing.png | Shapez Industries / Sense_101 | buildings/belt_crossing.png | 192×192 | 传送带交叉 |
| industries/crossing-blueprint.png | Shapez Industries / Sense_101 | blueprints/belt_crossing.png | 192×192 | 传送带交叉蓝图 |
| industries/hyper-in.png | Shapez Industries / Sense_101 | buildings/hyperlink-entrance.png | 192×384 | 超链接入口 |
| industries/hyper-in-blueprint.png | Shapez Industries / Sense_101 | blueprints/hyperlink-entrance.png | 192×384 | 超链接入口蓝图 |
| industries/hyper-out.png | Shapez Industries / Sense_101 | buildings/hyperlink-exit.png | 192×384 | 超链接出口 |
| industries/hyper-out-blueprint.png | Shapez Industries / Sense_101 | blueprints/hyperlink-exit.png | 192×384 | 超链接出口蓝图 |
| sq-x/swap.png | SQ-X / 梦想天生 | buildings/shape_swapper.png | 384×192 | 交换器 |

按 192px/格核对全部尺寸，并对照参考代码的物料接口位置：智能合并为底/两侧入、顶出，智能分离为底入、顶/两侧出，交叉为底→顶和侧→侧独立通道，超链接入口接口在第 1 行、出口在第 0 行，交换器为两列底入顶出。来源代码的槽索引顺序不作为本模组加工合同，逻辑角色由 src/game/catalog.ts 声明。

SQ-X 的 prioritizer.png 为 192×384，与本模组 1×1 优先器不符，不沿用。交换器（镜像）是不同加工规则，使用自制示意；普通交换器的蓝图图也是自制十二槽示意。其余建筑、工具栏图标、镜像变换与蓝图图由 src/game/artwork.ts 生成，主要机器输入→输出教程由 src/game/tutorials.ts 调用同一 drawShape/operate 生成。沿用图上覆盖目录端口编号，镜像只改变摆放。

PNG 经构建工具内嵌为 data URL；安装无额外图片下载。单文件 JS 同时包含所有源图片和生成规则，本清单随构建/打包说明交付。
