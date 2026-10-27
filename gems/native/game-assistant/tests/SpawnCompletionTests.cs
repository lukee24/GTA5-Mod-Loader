using Gems.GameAssistant;

// This links the production completion ticket. It does not invoke World.CreateVehicle
// and cannot prove the story-mode/model readiness guards in GemsAssistantScript.
public static class SpawnCompletionTests
{
    public static void Run(Action<bool, string> check)
    {
        void Check(bool value, string name) => check(value, "生成完成票据：" + name);
        var ticket = new SpawnCompletion();
        var creates = 0; var releases = 0;
        Check(ticket.Complete(() => creates++, () => releases++), "正常完成返回 true");
        Check(ticket.Consumed && creates == 1 && releases == 1, "正常路径先消耗票据并创建释放各一次");
        Check(!ticket.Complete(() => creates++, () => releases++) && creates == 1 && releases == 1,
            "正常完成后同票据不能二次创建或释放");

        foreach (var stage in new[] { "create", "register", "log", "release" })
        {
            ticket = new SpawnCompletion();
            creates = releases = 0; var registrations = 0; var logs = 0; var threw = false;
            try
            {
                ticket.Complete(() =>
                {
                    creates++; if (stage == "create") throw new IOException("create failed");
                    registrations++; if (stage == "register") throw new IOException("register failed");
                    logs++; if (stage == "log") throw new IOException("log failed");
                }, () => { releases++; if (stage == "release") throw new IOException("release failed"); });
            }
            catch (IOException) { threw = true; }
            Check(threw && ticket.Consumed && creates == 1 && releases == 1,
                stage + " 失败仍消费票据且执行模型释放一次");
            Check(registrations == (stage == "create" ? 0 : 1) && logs == (stage is "create" or "register" ? 0 : 1),
                stage + " 失败后不会继续后续创建处理步骤");
            Check(!ticket.Complete(() => creates++, () => releases++) && creates == 1 && releases == 1,
                stage + " 失败后再次调用不能重试创建或再次释放");
        }

        ticket = new SpawnCompletion(); creates = releases = 0;
        var nestedInCreate = true; var nestedInRelease = true;
        ticket.Complete(() =>
        {
            creates++;
            nestedInCreate = ticket.Complete(() => creates++, () => releases++);
        }, () =>
        {
            releases++;
            nestedInRelease = ticket.Complete(() => creates++, () => releases++);
        });
        Check(!nestedInCreate && !nestedInRelease && creates == 1 && releases == 1,
            "创建或释放回调重入同票据均被阻止");

        ticket = new SpawnCompletion(); creates = releases = 0;
        Exception? bothFailure = null;
        try
        {
            ticket.Complete(() => { creates++; throw new IOException("create failed"); },
                () => { releases++; throw new InvalidOperationException("release failed"); });
        }
        catch (Exception error) { bothFailure = error; }
        Check(bothFailure != null && ticket.Consumed && creates == 1 && releases == 1,
            "创建与释放同时失败仍只执行各一次并向调用方报告异常");
        Check(bothFailure is AggregateException aggregate && aggregate.InnerExceptions.Count == 2 &&
            aggregate.InnerExceptions[0].Message == "create failed" && aggregate.InnerExceptions[1].Message == "release failed",
            "双重失败同时保留创建原因和释放原因，不由 finally 异常覆盖原始错误");
        Check(!ticket.Complete(() => creates++, () => releases++) && creates == 1 && releases == 1,
            "双重失败也不会重新授权同一生成请求");

        ticket = new SpawnCompletion(); creates = releases = 0;
        var releaseCallback = 0; var allowed = false;
        ticket.Complete(() => creates++, () => { releaseCallback++; if (allowed) releases++; });
        Check(creates == 1 && releaseCallback == 1 && releases == 0,
            "调用方释放守卫拒绝时仅调用回调，不强制执行释放");
        allowed = true;
        Check(!ticket.Complete(() => creates++, () => { releaseCallback++; if (allowed) releases++; }) &&
            creates == 1 && releaseCallback == 1 && releases == 0,
            "守卫恢复后同票据不重放创建或旧释放回调");

        var another = new SpawnCompletion();
        Check(another.Complete(() => creates++, () => releases++) && creates == 2 && releases == 1,
            "用户新请求拥有独立票据，可正常完成一次");
    }
}
