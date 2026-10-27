using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Gems.GameAssistant;

// Pure model tests: no GTA assembly, native calls, game process, or user files.
public static class FoundationTests
{
    public static int Run(Action<bool, string> check)
    {
        var passed = 0;
        void Check(bool condition, string name) { check(condition, "基础：" + name); passed++; }
        void Reject<T>(Action action, string name) where T : Exception
        {
            try { action(); }
            catch (T) { Check(true, name); return; }
            Check(false, name);
        }

        foreach (var count in new[] { 11, 16 })
        {
            var menu = new MenuViewport();
            menu.Reset(count);
            Check(menu.Selected == 0 && menu.First == 0 && menu.VisibleCount == 8 && menu.VisibleSelection == 0, count + " 行初始视窗");
            menu.Move(7);
            Check(menu.Selected == 7 && menu.First == 0 && menu.VisibleSelection == 7, count + " 行第八项可见");
            menu.Move(1);
            Check(menu.Selected == 8 && menu.First == 1 && menu.VisibleSelection == 7, count + " 行第九项滚动且高亮不越界");
            menu.Move(count - 9);
            Check(menu.Selected == count - 1 && menu.First == count - 8 && menu.VisibleSelection == 7, count + " 行末项可见");
            menu.Move(1);
            Check(menu.Selected == 0 && menu.First == 0, count + " 行向下环绕首项");
            menu.Move(-1);
            Check(menu.Selected == count - 1 && menu.First == count - 8, count + " 行向上环绕末项");
            menu.SetCount(3);
            Check(menu.Selected == 2 && menu.First == 0 && menu.VisibleCount == 3 && menu.VisibleSelection == 2, count + " 行缩减夹紧选中项");
            menu.SetCount(0);
            menu.Move(int.MaxValue);
            menu.Move(int.MinValue);
            Check(menu.Selected == -1 && menu.First == 0 && menu.VisibleCount == 0 && menu.VisibleSelection == -1, count + " 行缩为空后移动安全");
            menu.SetCount(count);
            Check(menu.Selected == 0 && menu.First == 0 && menu.VisibleCount == 8, count + " 行由空集合恢复首项");
            menu.Move(int.MinValue);
            Check(menu.Selected >= 0 && menu.Selected < count && menu.VisibleSelection >= 0 && menu.VisibleSelection < 8, count + " 行极大负步长不溢出");
            menu.Reset(1);
            menu.Move(-1);
            Check(menu.Selected == 0 && menu.VisibleCount == 1 && menu.First == 0, count + " 行切换单项分类重置");
            Reject<ArgumentOutOfRangeException>(() => menu.SetCount(-1), "拒绝负数行数");
            Reject<ArgumentOutOfRangeException>(() => menu.SetCount(4097), "拒绝超量行数");
            Check(menu.Count == 1 && menu.Selected == 0, "拒绝非法行数不改变有效视窗");
        }

        var edges = new KeyEdges();
        const int toggle = 116, enter = 13, arrow = 40;
        Check(edges.Press(toggle) && !edges.Press(toggle) && !edges.Press(toggle), "F5 长按重复事件只接收一次");
        Check(edges.Press(enter) && !edges.Press(enter), "回车长按只执行一次且各键独立");
        edges.Release(toggle);
        edges.Release(toggle);
        Check(edges.Press(toggle), "重复 KeyUp 安全且松开后能重新触发");
        var reconciled = new List<int>();
        edges.Reconcile(key => { reconciled.Add(key); return key == enter; });
        Check(reconciled.Count == 2 && reconciled.Contains(toggle) && reconciled.Contains(enter), "校准只检查已按住的键");
        Check(edges.Press(toggle) && !edges.Press(enter), "校准清除已松开键并保留仍按住键");
        edges.Release(toggle);
        edges.Release(enter);
        edges.Release(arrow);
        var probes = 0;
        edges.Reconcile(key => { probes++; return false; });
        Check(probes == 0 && edges.Press(arrow), "关闭或守卫拒绝时可本地释放，空校准不调用探针");

        var ack = new MenuAcknowledgement();
        var first = new MenuRow("player:invincible", "无敌", "关闭");
        var second = new MenuRow("player:visible", "可见性", "开启");
        Check(!ack.Allows(first), "未绘制菜单行不能执行");
        ack.Record(first, false);
        Check(!ack.Allows(first), "不可见或字形不完整的行不能执行");
        ack.Record(first, true);
        Check(ack.Allows(first) && !ack.Allows(second), "渲染确认只允许实际显示的同一操作 key");
        Check(!ack.Allows(new MenuRow(first.Key, first.Label, "开启")), "读回状态变化后等待新画面，不能按旧值执行");
        Check(!ack.Allows(new MenuRow(first.Key, first.Label, first.Value, false)), "渲染后被禁用的行不能执行");
        ack.Record(new MenuRow(first.Key, first.Label, first.Value, false), true);
        Check(!ack.Allows(first), "绘制禁用行会撤销原先确认");
        ack.Record(second, true);
        ack.Clear();
        Check(!ack.Allows(second), "分类或选择变化清除旧渲染确认");

        var glyphs = new GlyphBudget();
        var ascii = "0123456789 +-.,:/=()[]_HPspeedxyz";
        foreach (var glyph in GlyphBudget.Elements(ascii)) glyphs.Admit(glyph);
        var warmCount = glyphs.Count;
        var allAdmitted = true;
        for (var value = 0; value < 10000; value++)
        {
            var dynamicText = "HP=" + value.ToString(CultureInfo.InvariantCulture) + "/100 x=-" + value.ToString(CultureInfo.InvariantCulture) + ".5 speed=1." + (value % 10).ToString(CultureInfo.InvariantCulture);
            foreach (var glyph in GlyphBudget.Elements(dynamicText)) allAdmitted &= glyphs.Admit(glyph);
        }
        Check(allAdmitted && glyphs.Count == warmCount, "一万组动态 ASCII 数值复用字形，不按完整字符串增长");
        var limit = new GlyphBudget();
        var admitted = true;
        for (var index = 0; index < GlyphBudget.Maximum - 1; index++) admitted &= limit.Admit(((char)(0x4e00 + index)).ToString());
        Check(admitted && limit.Count == 2048, "2048 字形预算包含预留 fallback");
        Check(!limit.Admit("\u6000") && limit.Count == 2048, "达到 2048 后拒绝新字形且不增长");
        Check(limit.Admit("\u4e00") && limit.Admit(GlyphBudget.Fallback) && limit.Count == 2048, "预算耗尽后已有字形与 fallback 仍可用");
        var small = new GlyphBudget(2);
        Check(small.Admit("A") && !small.Admit("B") && small.Count == 2, "小预算同样计算 fallback");
        Reject<ArgumentOutOfRangeException>(() => new GlyphBudget(1), "拒绝过小字形预算");
        Reject<ArgumentOutOfRangeException>(() => new GlyphBudget(2049), "拒绝超过上限的字形预算");
        foreach (var invalid in new[] { "", "AB", "\n", "\0", "\ud800", "\udfff", "a\u0301\u0302\u0303\u0304\u0305\u0306\u0307\u0308" })
        {
            var before = glyphs.Count;
            Check(!GlyphBudget.Valid(invalid) && !glyphs.Admit(invalid) && glyphs.Count == before, "拒绝非法字形 " + Convert.ToHexString(System.Text.Encoding.Unicode.GetBytes(invalid)));
            Reject<ArgumentException>(() => GlyphBudget.FileKey(invalid), "非法字形不能生成缓存文件 key");
        }
        foreach (var valid in new[] { "A", "中", "é", "e\u0301", "\ud83d\ude80", " ", GlyphBudget.Fallback })
        {
            var key = GlyphBudget.FileKey(valid);
            Check(GlyphBudget.Valid(valid) && GlyphBudget.FromFileKey(key) == valid && !key.Contains('/') && !key.Contains('\\'), "合法字形缓存 key 往返 " + key);
        }
        foreach (var invalid in new[] { "", "glyph-.png", "glyph-004.png", "glyph-0041.txt", "Glyph-0041.png", "glyph-004a.png", "glyph-ZZZZ.png", "glyph-00410042.png", "glyph-000A.png", "glyph-D800.png", "glyph-DC00.png", "../glyph-0041.png", "glyph-0041.png/child", "glyph-" + new string('0', 36) + ".png" })
            Check(GlyphBudget.FromFileKey(invalid) == null, "拒绝非法缓存文件 key " + invalid);
        Check(GlyphBudget.Elements(new string('1', 2000)).Count() == 1024, "单次文字枚举限制 1024 字形");

        var identity = new PlayerIdentity(0, 101, 202, 303);
        var changedTargets = new[]
        {
            new PlayerIdentity(1, 101, 202, 303), new PlayerIdentity(0, 102, 202, 303),
            new PlayerIdentity(0, 101, 203, 303), new PlayerIdentity(0, 101, 202, 304)
        };
        bool ForbiddenRead() => throw new Exception("守卫或身份拒绝后仍调用 read");
        void ForbiddenWrite(bool expected, bool desired) => throw new Exception("守卫或身份拒绝后仍调用 write");
        var denied = new OwnedBooleanState();
        Check(denied.Set(false, identity, true, ForbiddenRead, ForbiddenWrite) == StateOutcome.GuardDenied && !denied.HasValue, "未授权 Set 不读取也不写入游戏状态");
        Check(denied.Restore(false, identity, ForbiddenRead, ForbiddenWrite) == StateOutcome.Unchanged, "空恢复记录不接触游戏端口");

        foreach (var target in changedTargets)
        {
            var state = new OwnedBooleanState();
            var value = false;
            state.Set(true, identity, true, () => value, (expected, desired) => value = desired);
            Check(state.Set(false, target, false, ForbiddenRead, ForbiddenWrite) == StateOutcome.GuardDenied && state.HasValue, "守卫拒绝优先于目标检查并保留恢复记录");
            Check(state.Restore(false, identity, ForbiddenRead, ForbiddenWrite) == StateOutcome.GuardDenied && state.HasValue, "守卫拒绝 Restore 不调用委托且保留记录");
            Check(state.Set(true, target, false, ForbiddenRead, ForbiddenWrite) == StateOutcome.TargetChanged && !state.HasValue && value, "目标身份任一字段变化时 Set 放弃记录且不碰新目标");
            state.Set(true, identity, false, () => value, (expected, desired) => value = desired);
            Check(state.Restore(true, target, ForbiddenRead, ForbiddenWrite) == StateOutcome.TargetChanged && !state.HasValue && !value, "目标身份变化时 Restore 不读取或修改新目标");
        }

        foreach (var original in new[] { false, true })
        {
            var state = new OwnedBooleanState();
            var value = original;
            var writes = 0;
            void Write(bool expected, bool desired) { if (expected != value) throw new Exception("条件写入收到过期 expected"); writes++; value = desired; }
            Check(state.Set(true, identity, original, () => value, Write) == StateOutcome.Unchanged && !state.HasValue && writes == 0, "设置已有值不取得状态所有权 " + original);
            Check(state.Set(true, identity, !original, () => value, Write) == StateOutcome.Applied && state.HasValue && state.Original == original && state.LastWritten == !original && state.Target.Equals(identity), "记录原值与实际目标 " + original);
            Check(state.Restore(true, identity, () => value, Write) == StateOutcome.Restored && value == original && !state.HasValue && writes == 2, "只在条件匹配时恢复原值 " + original);
            Check(state.Restore(true, identity, ForbiddenRead, ForbiddenWrite) == StateOutcome.Unchanged, "重复恢复幂等且无端口调用 " + original);
            state.Set(true, identity, !original, () => value, Write);
            value = original; // Another script has already changed the value.
            var before = writes;
            Check(state.Restore(true, identity, () => value, Write) == StateOutcome.Restored && value == original && writes == before && !state.HasValue, "外部已经恢复原值时不再次写入 " + original);
            state.Set(true, identity, !original, () => value, Write);
            value = original;
            before = writes;
            Check(state.Set(true, identity, !original, () => value, Write) == StateOutcome.ExternalChange && value == original && writes == before && !state.HasValue, "外部改值后不重新强制覆盖 " + original);
        }

        var partial = new OwnedBooleanState();
        var partialValue = false;
        Reject<InvalidOperationException>(() => partial.Set(true, identity, true, () => partialValue, (expected, desired) => { partialValue = desired; throw new InvalidOperationException("setter 已修改后失败"); }), "传播 setter 部分完成异常");
        Check(partial.HasValue && !partial.Original && partial.LastWritten && partialValue, "setter 部分异常保留原值及最后写入恢复记录");
        Check(partial.Restore(true, identity, () => partialValue, (expected, desired) => partialValue = desired) == StateOutcome.Restored && !partialValue && !partial.HasValue, "setter 部分完成后仍可条件恢复");

        var beforeWrite = new OwnedBooleanState();
        var beforeWriteValue = false;
        Reject<InvalidOperationException>(() => beforeWrite.Set(true, identity, true, () => beforeWriteValue, (expected, desired) => throw new InvalidOperationException("setter 写入前失败")), "传播初次 setter 写入前异常");
        Check(beforeWrite.HasValue && !beforeWriteValue, "初次 setter 写入前失败保留可判定记录");
        Check(beforeWrite.Restore(true, identity, () => beforeWriteValue, ForbiddenWrite) == StateOutcome.Restored && !beforeWrite.HasValue, "实际仍为原值时只清记录不写入");

        var mismatch = new OwnedBooleanState();
        var mismatchValue = false;
        Check(mismatch.Set(true, identity, true, () => mismatchValue, (expected, desired) => { }) == StateOutcome.ReadbackMismatch && mismatch.HasValue && !mismatchValue, "设置读回不匹配不能报告成功且保留恢复记录");
        Check(mismatch.Restore(true, identity, () => mismatchValue, ForbiddenWrite) == StateOutcome.Restored && !mismatch.HasValue, "读回不匹配但实际原值未变可安全清理");
        mismatch.Set(true, identity, true, () => mismatchValue, (expected, desired) => mismatchValue = desired);
        Check(mismatch.Restore(true, identity, () => mismatchValue, (expected, desired) => { }) == StateOutcome.ReadbackMismatch && mismatch.HasValue && mismatchValue, "恢复读回不匹配保留记录以便复测");
        Check(mismatch.Restore(true, identity, () => mismatchValue, (expected, desired) => mismatchValue = desired) == StateOutcome.Restored && !mismatchValue && !mismatch.HasValue, "恢复读回失败后再次恢复成功");

        var failedDisable = new OwnedBooleanState();
        var disableValue = false;
        failedDisable.Set(true, identity, true, () => disableValue, (expected, desired) => disableValue = desired);
        Reject<InvalidOperationException>(() => failedDisable.Set(true, identity, false, () => disableValue, (expected, desired) => throw new InvalidOperationException("关闭开关在写入前失败")), "已拥有状态的关闭 setter 写入前异常");
        Check(failedDisable.HasValue && disableValue, "关闭失败保留原先仍生效的状态记录");
        Check(failedDisable.Restore(true, identity, () => disableValue, (expected, desired) => disableValue = desired) == StateOutcome.Restored && !disableValue && !failedDisable.HasValue, "关闭写入前失败后仍须恢复自己上次成功写入的值");

        return passed;
    }
}
