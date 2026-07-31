using System.Collections;
using System.Globalization;
using System.Reflection;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;

namespace ERPPrototype.IntegrationTests;

internal static class PendingModelChangesDiagnostics
{
    private const string PendingModelChangesMarker =
        "PendingModelChangesWarning";

    public static bool IsPendingModelChanges(
        InvalidOperationException exception)
    {
        return exception.Message.Contains(
            PendingModelChangesMarker,
            StringComparison.Ordinal);
    }

    public static string BuildReport(DbContext dbContext)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var migrationsAssembly =
            dbContext.GetService<IMigrationsAssembly>();
        var modelDiffer =
            dbContext.GetService<IMigrationsModelDiffer>();
        var runtimeInitializer =
            dbContext.GetService<IModelRuntimeInitializer>();
        var designTimeModel =
            dbContext.GetService<IDesignTimeModel>().Model;

        var snapshot = migrationsAssembly.ModelSnapshot;
        if (snapshot is null)
        {
            return """
                Pending model changes were detected, but the migration
                ModelSnapshot is missing.
                """;
        }

        var initializedSnapshot =
            runtimeInitializer.Initialize(snapshot.Model);

        var operations = modelDiffer.GetDifferences(
            initializedSnapshot.GetRelationalModel(),
            designTimeModel.GetRelationalModel());

        var builder = new StringBuilder();
        builder.AppendLine();
        builder.AppendLine(
            "Pending EF model changes detected before integration tests.");
        builder.AppendLine(
            $"Snapshot: {snapshot.GetType().FullName}");
        builder.AppendLine(
            $"Detected operations: {operations.Count}");

        if (operations.Count == 0)
        {
            builder.AppendLine(
                "No migration operations were returned. The model may be " +
                "non-deterministic; run the command again and compare output.");
            return builder.ToString();
        }

        for (var index = 0; index < operations.Count; index++)
        {
            builder.AppendLine();
            builder.AppendLine(
                $"[{index + 1}] {operations[index].GetType().Name}");
            AppendOperation(builder, operations[index]);
        }

        builder.AppendLine();
        builder.AppendLine(
            "Do not suppress PendingModelChangesWarning and do not update " +
            "the real database yet.");
        builder.AppendLine(
            "Send this complete operation list for the migration fix.");

        return builder.ToString();
    }

    private static void AppendOperation(
        StringBuilder builder,
        MigrationOperation operation)
    {
        var properties = operation.GetType()
            .GetProperties(BindingFlags.Instance | BindingFlags.Public)
            .Where(property =>
                property.CanRead &&
                property.GetIndexParameters().Length == 0 &&
                property.Name is not nameof(MigrationOperation.IsDestructiveChange))
            .OrderBy(property => property.Name, StringComparer.Ordinal);

        foreach (var property in properties)
        {
            object? value;
            try
            {
                value = property.GetValue(operation);
            }
            catch (TargetInvocationException)
            {
                continue;
            }

            if (!TryFormatValue(value, out var formattedValue))
            {
                continue;
            }

            builder.Append("    ");
            builder.Append(property.Name);
            builder.Append(": ");
            builder.AppendLine(formattedValue);
        }

        builder.Append("    IsDestructiveChange: ");
        builder.AppendLine(operation.IsDestructiveChange.ToString());
    }

    private static bool TryFormatValue(
        object? value,
        out string formattedValue)
    {
        switch (value)
        {
            case null:
                formattedValue = "<null>";
                return true;

            case string text:
                formattedValue = string.IsNullOrEmpty(text)
                    ? "<empty>"
                    : text;
                return true;

            case Type type:
                formattedValue = type.FullName ?? type.Name;
                return true;

            case bool boolean:
                formattedValue = boolean.ToString();
                return true;

            case Enum enumeration:
                formattedValue = enumeration.ToString();
                return true;

            case byte[] bytes:
                formattedValue = Convert.ToHexString(bytes);
                return true;

            case IFormattable formattable:
                formattedValue = formattable.ToString(
                    null,
                    CultureInfo.InvariantCulture);
                return true;

            case IEnumerable enumerable:
                var items = new List<string>();
                foreach (var item in enumerable)
                {
                    if (item is null)
                    {
                        items.Add("<null>");
                    }
                    else if (item is string itemText)
                    {
                        items.Add(itemText);
                    }
                    else if (item is IFormattable itemFormattable)
                    {
                        items.Add(itemFormattable.ToString(
                            null,
                            CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        return NotPrintable(out formattedValue);
                    }
                }

                formattedValue = $"[{string.Join(", ", items)}]";
                return true;

            default:
                return NotPrintable(out formattedValue);
        }
    }

    private static bool NotPrintable(out string formattedValue)
    {
        formattedValue = string.Empty;
        return false;
    }
}
