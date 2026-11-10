-- 一次性回填：账本建立前的 80 个迁移。
--
-- 2026-11-10 用只读查询逐个核对了线上库（表、列、索引、约束、枚举值、策略、触发器、
-- 函数、RLS 开关、存储桶、表级权限，以及种子数据是否在）。核对方法与逐文件结论见 PR 描述。
--   * 下面 78 个：效果已在线上，登记为 backfilled。
--   * 文件末尾注释掉的 2 个：纯数据更新，结构上看不出跑没跑过，由维护者判断后
--     取消注释登记，或补跑后登记。在此之前 npm run audit:migrations 会一直把它们列为未登记。
-- checksum 是文件当前内容的 sha256，之后谁改了历史文件，audit 会报「登记后被改过」。
-- on conflict do nothing：可重复执行，不覆盖已有登记。

insert into public.applied_migrations (filename, checksum, backfilled) values
('20260510190403_initial_schema.sql', '85b7a4b6f0e47545da231a3a08426f271b8cff7c31b229518c27db06323dbb0a', true),
('20260510190404_agent_model_config.sql', '853fd766c925e0087e6336ae76dc7508bf97cc461a15e6e267a5f0c0d11b4d7c', true),
('20260510190405_chat_schema.sql', '50e3496fbdfd11d4d6daee7fbe87cf038e50ac7c70b85f8035ba067580ae1a39', true),
('20260510190406_milestones.sql', '85ef61b6d36e73bb1b9b5c1d2f6d48f3f095ca3248a7367107d4720f3476174d', true),
('20260510190407_add_platform_id.sql', '4f4b2b72ab1083261eda956ec624b408b5038003a00d9f9b7f47af1fa6626762', true),
('20260510190408_creator_activity_logs.sql', '009c48b79c1a3a6759801b4ab19ea04ff3aa6e955a63de548baa855fcf259c71', true),
('20260510190409_users_table.sql', '9500eaeee4cb5c2845d53fc50c365bc7f5bfb113bc5a33225325dc6f315c272e', true),
('20260510190410_broadcast_accounts_and_user_codes.sql', 'bc2b5c8d697d30d65472896ad7992f85dd942cee03511a25ff4b54e03f884693', true),
('20260510190411_devices.sql', '4a4272cf984d98dcfdc7ca35711cd1d2e4945d19d40404e8fb5549d3431040db', true),
('20260510190412_pmo_activity_events.sql', 'c6bbcf6e1af8c6d821b50c92f7a72e34273d5883399a3902b2be516cfec989f9', true),
('20260511142957_fix_activity_actor_type_casts.sql', '3e21013c9b21f11bb077c5f7571830c85e454920848b1e3e34dfae698987ddc9', true),
('20260511195015_expenses.sql', 'faf09d362277e0236365756e51707e06f3814aa1c2502eff750d65ed38036b15', true),
('20260511211117_work_tasks.sql', '34ca3d7a6ed67ece2396998026006f05713d1fcd932166189856ba2acaad7b66', true),
('20260511225217_intent_tables.sql', 'a0c9862b92bf660fd2c90488fbc98e23ce78966c7e57b07e082b18a7372dd6ac', true),
('20260512175531_add_tech_role.sql', 'b1923446f82dd634e4bf0ca5dccf487ba99558c91bd6927ada64150180e61ea5', true),
('20260512175532_fix_user_profile_trigger.sql', 'd745e106df501238c0413bd3ee484f1df2848100c5743093ccd745c84180e52b', true),
('20260512180441_creator_terminated_status.sql', '99af9816e5422cad6f78a2445fd8539b77927b09818c0679eeddcd956d95794f', true),
('20260512184213_finance_forecast_inputs.sql', 'b8d94e92ac75493101e0c65fe5ed097c5f0467ff09c154082710ed28905c42e2', true),
('20260512201612_expense_saved_views.sql', '04192627556b57c9708c6b8db55c521337349d7b2806ef52cbfaf5cc120f646c', true),
('20260512202100_add_terminated_creator_status.sql', '343ef4e8a148502cc3e492d5bc4742f1cede85ee1d463cfaddeabd7b5dbf7abf', true),
('20260512210321_add_jp_chenhao_tz_buyer.sql', 'c947a06327898992287bed4b903eeb943eb90abb87f611a1b0e170fdf59a84e3', true),
('20260512214833_access_control.sql', '826643c24654276d3c5f02fc22caebd09f391a6f97a3d6fe302b298097928802', true),
('20260513152844_intent_audit.sql', 'ee269342a00e8858c4584cf3e738c2e3060926c7599f44562106329a236ccd59', true),
('20260513170640_finance_forecast_views.sql', '39b86d1ab40e64cf2c3b8bda1256be62a133179ea2ad175c28830c0c16b30265', true),
('20260513231810_finance_forecast_lifecycle.sql', '367de02911813cce08ecc7ff7f02cc62568f8b947c7833b78d1b7bedf06a29eb', true),
('20260514175410_work_task_extensions.sql', 'd3c84509c940e12f0fffd5f7c7cbc36ff4a40c35525a77607053b0b2c4d86e0d', true),
('20260515193205_discussions.sql', 'ea5f52881581eae0171fc16fc210ddf6f2296ec61e5ac1018e9bbdc6f879c86f', true),
('20260520171814_notifications.sql', 'b8d2041c3a64ca740d56b05a4c008646e5324708c71eabb800be170e340fec8e', true),
('20260623014015_venue.sql', '4bed9690a609a771107084565b076838c9f88cc593c30138a1897697c9055ce6', true),
('20260623014016_items.sql', 'f24c3a0ab85da9beab6f801c8a2b204f7a846091c5eb51be7161f1de8b5b6df9', true),
('20260623014017_venue_view_bookmarks.sql', '3481f0dbe60d744cd59eec67c7240c14134d45bcf335bcaa809ab4756e0e9c29', true),
('20260623014018_item_photos.sql', '8da996d8e064b25104207214365fa6ed905670d3f6aa7aefb29d6ca3678cb6a3', true),
('20260623014100_agent_runs.sql', 'f29041932db18deb59623b3eb733dfadeb7aabc1e4f302dbd04dec3fe54af30a', true),
('20260623014101_w1_followups.sql', '9899e3cf5c23d9058b506fb7ba1b0390ae1efe0431a374f890ebc19c1dba5b55', true),
('20260623014102_deprecate_orphan_conversations.sql', 'f9239865aa6913671874ed536445db4e9bd603ec56edf5618da54c58836e25ac', true),
('20260623194634_venue_collaborators.sql', 'e2c27e52bedc67af4f1539d114dd57f30e28571a0ea5abd84a482eccde718e40', true),
('20260623194635_item_value.sql', 'f50daa97b2af6bd7a16169982deb840e844cfd9b5cc77ecff1d229933a694d81', true),
('20260628221941_venue_item_name_i18n.sql', '3b5eb3488ecaf6540b00a0255d3742939a1bf38031d6d12fa7acb779bdff771e', true),
('20260628224300_venue_item_placement.sql', '137f32480feb817f3fed4db8f6112e363048e54b82ade3e2475565e12f6c6be2', true),
('20260628232300_item_name_i18n.sql', '1eaf83084aa308c8228c62d1d29168e15aa0b2e8b53c47a764669e8d0f1fd3c1', true),
('20260629013411_venue_item_window.sql', '898a9172819f9623275a22ba4621db20444e62689ddc978a260e4391c4967a36', true),
('20260629024648_venue_item_merged_with.sql', '541280b7638eac9af0b75811ab8642be7b605f60b36a416dc3cf5f950655d033', true),
('20260701151400_venue_item_truss_light.sql', 'd70b8db42c0e5ed57a465ba8dbb58cfe5e89ce0c8cc492fb3614cd484772ba0b', true),
('20260701151401_venue_item_light_forms.sql', '79ccb14cef985174dafe214ffdbb09b1e8e3803d05a9a7be088552b978598562', true),
('20260701200037_enable_rls_all_tables.sql', '2c80900a7117d7d20953677f12f96aac3d3d2248001292d3413020c76d35c4a6', true),
('20260701222912_venue_item_mm_precision.sql', '9d509004349083a3f2ef42acc63d65c9901a989a7cbae30b1d8eea01e75cabaf', true),
('20260712000731_org_structure.sql', '66604f08eef69419e4cb3eb17b040d8a52ceb7d612cface6a5580dc6a3a65171', true),
('20260722161523_work_task_org_link.sql', '294b3b34af1c840425287d89838a3c28c1daa1baeb8b2fc4449ce2ed20d9d74e', true),
('20260723103402_competitor_monitoring.sql', '5fdfab1b9ff489ecfd0d2908c373b52d4ca937587f83c2f5396623984e9d4f5e', true),
('20260729163344_competitor_dossier.sql', '9d89bab0ce3952272e347430088b67422654395b7f8798f381de288f15deeefb', true),
('20260729170600_competitor_dossier_metrics.sql', '38df4d27bd1192d65303984c2b46526df432fef6a5c1f43d37ff0c97037c3fcb', true),
('20260729173015_competitor_parent.sql', 'c6ef75307500a37fb95f798c15984bbedddc9cca16eeb156fcab831fe01f46bc', true),
('20260811183310_site_applications.sql', 'cd593f83342a3798795d56702467ecb11ec307806b0d5ac8008d56a455f809d8', true),
('20260812111104_enable_rls_venue_items.sql', '278daaf14280b3e029d218c320bfe6a118cda8d3e9b34779d3d3ef855b9ee0b1', true),
('20260812111105_enable_rls_langgraph_checkpoints.sql', '864d181302a5773b7b416471d9cbf4b785acb68ad580daff3b4afe8f3875d60e', true),
('20260814074006_rls_users_broadcast_accounts_salary.sql', '56241ae5555d7e4e4ae9a017e6ce5dfc8306e3f4ea3342e85cdd6a98502ec412', true),
('20260814112722_site_applications_kinds.sql', 'fbb9147cb33d21887e26573ee1f91a290394dee7fe5d0f18fa37ef44137ce8b4', true),
('20260814112723_site_content.sql', '8ea6c2c63f06aa31b288eff7ca8fe8a66da47b5c259f043f72b6845a07085994', true),
('20260814112724_site_media_bucket.sql', '423f42d6ee804616dbc62f632594f68596ba585ad62387698c2d672975176767', true),
('20260815132734_member_slots_flexible.sql', '683ec294aea41ae54a6b1c9e0e6eec15d4c0c1424da68c3a821eaa48e238191a', true),
('20260818000000_competitor_shots_live_metrics.sql', '06d743819255445b1cb91a5ebeba57e1b6c1c7cf7c617a960c3b2b561a7aad14', true),
('20260819000000_competitor_snapshot_language.sql', '6d5dd8b3a27d7a48f7b079dcb4516b35e528fa5c3d38b69266c842c0b79df5b9', true),
('20260831185026_milestone_completed_date.sql', 'a3901af19e571bc804d3ab242aa2c7fbdc6f6e7e2a1077ea6bbde8d363e61e54', true),
('20260901222510_site_applications_dance_fields.sql', 'f42a075a30fb2a8256916676754e144d74dda096bfde0315d0fa2fa5e1af60fa', true),
('20260915104500_competitor_descriptions.sql', '6bfe49b10afeb42f3ba6f13ac61e250b51c721091282ce9844d134182a1f1f7c', true),
('20261007103240_competitor_companies.sql', 'fccbda6a5a6fd892bd89e95875e914d63965e17ba9bfa66c480611e71cacb619', true),
('20261007103241_competitor_companies_seed.sql', '675a37e5077660429299f7a4b0dbc82f87493315153b9fa9e57c3bea3709f366', true),
('20261008182533_competitor_company_accounts_highlight.sql', '0222c3f34b8423907cb3bb03975e0a81d88c43c78a6c4f44b5619e43d9707847', true),
('20261008190427_competitor_company_ggtk_links.sql', '38daa16d1aba5fe7c9057f5918ae99bb1416e8688b45db9d473b5947bfd55a37', true),
('20261008195135_competitor_company_ggtk_1tb_cross.sql', '0f7a946eb41a3452bf7ef3a0df2579f6ef71367239c522f30e842b3db92fa5a5', true),
('20261008212354_competitor_company_accounts_snapshot.sql', 'baf1accf968a0dc13acc4ebac667dca1b81b6b2c80421a0f7205c8a22a62cf3f', true),
('20261009183208_competitor_region_no_default.sql', 'd2f9d76605e90d6d3ba22979446887c065808568f20c83e1f460b67516cf3175', true),
('20261009212901_competitor_quick_shot.sql', 'a350f114044ca642259ea21060bba588451d20d857b937278f92dd1f8511fe3a', true),
('20261010120000_competitor_live_sessions.sql', '51af9c5ba394a6e47d365036c705321c7d3015f59a3cf2ce6a99fd99387b0455', true),
('20261011120157_competitor_live_summaries.sql', 'a4983eed48c984debc8b297bb03ec6c16913897f100c57c206dac6de85220c29', true),
('20261015130534_task_item_quadrant.sql', '76b839c68747f9fea2e80d348e952c3d2322c98a70654c0e3d9ea1b1b76dbaf4', true),
('20261026120000_competitor_scoped_accounts.sql', '8a06aee8fca619c377bfadffb775a71aeb649be9d8d2fd0e96784678d6acd591', true),
('20261110084614_revoke_client_table_grants.sql', '52fabfaca1575f153fcad9044e4fe93e29cd89e219671fd3542515638d0229a8', true)
on conflict (filename) do nothing;

-- 无法确认，默认不登记：
--   20260511221935_backfill_expense_period.sql
--     纯数据更新。salary/rent/cloud_services 三类现在没有不合格的 period，与已执行一致，但表里没有这三类的旧行时结果也一样，证明不了
--   20260512015620_backfill_all_expense_periods.sql
--     纯数据更新。执行时点之前建的行里仍有 14 行 period 为空（office_supplies / travel / tangible_asset），可能没跑过，也可能跑过后被界面改空
--
-- insert into public.applied_migrations (filename, checksum, backfilled) values
-- ('20260511221935_backfill_expense_period.sql', '7409b79f1fcb970e24306b05bdafcbf8ebb4f272d9d89ceb6ddc3dbee5bb3115', true),
-- ('20260512015620_backfill_all_expense_periods.sql', 'fd66673c3f2fac53c294bec8e281ce55fbb94048615599d8e492ccb9b2bc5811', true)
-- on conflict (filename) do nothing;

-- @applied-migrations-ledger（由 npm run migrations:stamp 生成，勿手改；改了上面的 SQL 要重新生成）
insert into public.applied_migrations (filename, checksum)
values ('20261110084921_applied_migrations_backfill.sql', '2c6464b52f37d399fd71d727dd917de0b770c63bba374adaa31926f65acba62e')
on conflict (filename) do update
  set checksum = excluded.checksum, applied_at = now(), backfilled = false;
