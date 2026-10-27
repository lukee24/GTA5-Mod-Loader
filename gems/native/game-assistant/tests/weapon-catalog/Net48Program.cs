using System;
using Gems.GameAssistant;

internal static class Net48Program
{
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length != 1) throw new ArgumentException("Pass a real isolated producer JSON fixture.");
            var catalog = WeaponCatalog.Read(args[0]);
            if (catalog.Weapons.Count == 0 || new WeaponGameIdentity().Match(catalog, out _)) throw new Exception("Expected populated metadata and a rejected non-game test host.");
            if (!new WeaponGameIdentity(() => catalog.GameRoot).Match(catalog, out _)) throw new Exception("Injected resolved root should match.");
            Console.WriteLine("NET48 READER: actual CLR " + Environment.Version + "; rows=" + catalog.Weapons.Count + "; revision=" + catalog.Revision + "; digest=" + catalog.ContentDigest + "; actual non-GTA process denied; no game invocation.");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
