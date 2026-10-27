using System;

namespace Gems.GameAssistant
{
    public static class StoryGuard
    {
        // Do not query player/entity state after an earlier safety check has refused access.
        public static bool Probe(bool enhancedProcess, Func<bool> networkGame, Func<bool> sessionActive, Func<bool> sessionStarted, Func<bool> loading, Func<bool> playerValid)
            => enhancedProcess && !networkGame() && !sessionActive() && !sessionStarted() && !loading() && playerValid();
        public static bool Allows(bool enhancedProcess, bool networkGame, bool sessionActive, bool sessionStarted, bool loading, bool playerValid)
            => enhancedProcess && !networkGame && !sessionActive && !sessionStarted && !loading && playerValid;
    }
}
