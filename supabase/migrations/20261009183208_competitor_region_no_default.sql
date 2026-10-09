-- competitors.region 去掉默认值 'JP'，允许为空。
--
-- 原来建档不带地区就静默落成 JP，后台又没地方选，于是新加的韩国团、马来西亚团
-- 全被登记成日本（2026-10 实锤 3 个）。现在：后台加主账号必须选地区，子账号沿用
-- 父账号；采集脚本建档不带地区时留 null，页面显示「地区未填」提示人补。
--
-- 只改列定义，不动已有数据。重复执行无副作用。

alter table competitors alter column region drop default;
alter table competitors alter column region drop not null;
