using System;

namespace Gems.GameAssistant
{
    // Consume the ticket before invoking CreateVehicle. Failed registration, logging,
    // or cleanup never authorizes a second vehicle creation for the same request.
    public sealed class SpawnCompletion
    {
        public bool Consumed { get; private set; }
        public bool Complete(Action createAndRegister, Action releaseModel)
        {
            if (Consumed) return false;
            Consumed = true;
            Exception? original = null;
            try { createAndRegister(); }
            catch (Exception error) { original = error; throw; }
            finally
            {
                try { releaseModel(); }
                catch (Exception cleanup)
                {
                    if (original != null) throw new AggregateException("车辆创建/登记与模型释放均失败。", original, cleanup);
                    throw;
                }
            }
            return true;
        }
    }
}
