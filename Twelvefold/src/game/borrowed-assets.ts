import merge from "../../assets/industries/merge.png";
import mergeBlueprint from "../../assets/industries/merge-blueprint.png";
import split from "../../assets/industries/split.png";
import splitBlueprint from "../../assets/industries/split-blueprint.png";
import crossing from "../../assets/industries/crossing.png";
import crossingBlueprint from "../../assets/industries/crossing-blueprint.png";
import hyperIn from "../../assets/industries/hyper-in.png";
import hyperInBlueprint from "../../assets/industries/hyper-in-blueprint.png";
import hyperOut from "../../assets/industries/hyper-out.png";
import hyperOutBlueprint from "../../assets/industries/hyper-out-blueprint.png";
import swap from "../../assets/sq-x/swap.png";

/** 只收录尺寸与端口已静态核对的资源；逐文件来源见 assets/SOURCES.md。 */
export const BORROWED: Readonly<Record<string, { building: string; blueprint?: string }>> = {
    merge: { building: merge, blueprint: mergeBlueprint }, split: { building: split, blueprint: splitBlueprint }, crossing: { building: crossing, blueprint: crossingBlueprint },
    hyperIn: { building: hyperIn, blueprint: hyperInBlueprint }, hyperOut: { building: hyperOut, blueprint: hyperOutBlueprint }, swap: { building: swap },
};
