using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using ERPPrototype.Data;
using ERPPrototype.Data.Entities;
using Microsoft.JSInterop;

namespace ERPPrototype.Components.Pages;

public partial class WorkOrdersRevoGridNativeGate5A
{
    // JS interop streaming keeps large Save generations off SignalR's normal
    // single-message path. The bound is per Save payload, not a global hub
    // message-limit increase.
    private const long MaximumB12PersistenceProjectionBytes =
        32L * 1024L * 1024L;

    private string? PendingCommittedB12SaveId;
    private NativeGate5B12ReconcileResult? PendingCommittedB12Reconcile;
    private int PendingCommittedB12MovedCount;

    private async Task HandleRealDbSaveAsync()
    {
        var overallSaveStartedAt = Stopwatch.GetTimestamp();

        if (
            IsSaveHandshakeInFlight ||
            !GridInitialized ||
            GridModule is null)
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(PendingCommittedB12SaveId))
        {
            if (PendingCommittedB12Reconcile is not null)
            {
                await RetryCommittedB12ReconcileAsync();
            }
            else
            {
                // SQL already committed, but the local reconcile payload could
                // not be constructed. Never execute this Save generation again.
                OperationMessage =
                    "تم الحفظ في قاعدة البيانات، لكن تعذر تجهيز تحديث الشيت محليًا. أعد تحميل الصفحة؛ لن يتم إرسال SQL مرة أخرى.";
                StateHasChanged();
            }
            return;
        }

        NativeGate5B11BeginSaveDecision? decision = null;
        IsSaveHandshakeInFlight = true;
        OperationMessage = string.Empty;
        StateHasChanged();

        try
        {
            var beginHandshakeStartedAt = Stopwatch.GetTimestamp();
            decision =
                await GridModule.InvokeAsync<NativeGate5B11BeginSaveDecision>(
                    "beginSaveHandshake",
                    GridElementId);
            Logger.LogInformation(
                "[B12-PERF] phase=begin-handshake elapsedMs={ElapsedMs:F1} allowed={Allowed} dirtyCells={DirtyCells} dirtyRows={DirtyRows} changedRecords={ChangedRecords} deletedRecords={DeletedRecords}",
                ElapsedB12Ms(beginHandshakeStartedAt),
                decision.Allowed,
                decision.DirtyCellCount,
                decision.DirtyRowCount,
                decision.ChangedRecordCount,
                decision.DeletedRecordCount);

            if (!decision.Allowed || string.IsNullOrWhiteSpace(decision.SaveId))
            {
                OperationMessage = decision.Reason switch
                {
                    "clean" => "لا توجد تغييرات للحفظ.",
                    "validation" => "تعذر الحفظ: أصلح الخلايا غير الصحيحة أولًا.",
                    "custom-columns-pending" => "تعذر التقاط تغييرات الأعمدة المخصصة مؤقتًا.",
                    "save-active" => "عملية حفظ أخرى ما زالت جارية.",
                    _ => "الحفظ غير متاح مؤقتًا أثناء انشغال الشيت."
                };
                return;
            }

            NativeGate5B12SaveContract contract;
            var projectionTransferStartedAt = Stopwatch.GetTimestamp();
            try
            {
                var streamReferenceStartedAt = Stopwatch.GetTimestamp();
                await using var projectionReference =
                    await GridModule.InvokeAsync<IJSStreamReference>(
                        "getActiveSavePersistenceStream",
                        GridElementId,
                        decision.SaveId);

                var projectionMetrics =
                    await GridModule.InvokeAsync<NativeGate5B12PersistenceProjectionMetrics>(
                        "getActiveSavePersistenceMetrics",
                        GridElementId,
                        decision.SaveId);

                Logger.LogInformation(
                    "[B12-PERF] phase=persistence-projection buildMs={BuildMs:F1} streamReferenceMs={StreamReferenceMs:F1} bytes={Bytes} schemaVersion={SchemaVersion} changedRecords={ChangedRecords} deletedRecords={DeletedRecords}",
                    projectionMetrics.BuildMs,
                    ElapsedB12Ms(streamReferenceStartedAt),
                    projectionMetrics.Bytes,
                    projectionMetrics.SchemaVersion,
                    projectionMetrics.ChangedRecordCount,
                    projectionMetrics.DeletedRecordCount);

                if (projectionMetrics.Bytes > MaximumB12PersistenceProjectionBytes)
                {
                    throw new InvalidOperationException(
                        $"The B12 persistence projection is {projectionMetrics.Bytes:N0} bytes, which exceeds the bounded {MaximumB12PersistenceProjectionBytes:N0}-byte Save limit.");
                }

                var streamOpenStartedAt = Stopwatch.GetTimestamp();
                await using var projectionStream =
                    await projectionReference.OpenReadStreamAsync(
                        MaximumB12PersistenceProjectionBytes);
                Logger.LogInformation(
                    "[B12-PERF] phase=persistence-stream-open elapsedMs={ElapsedMs:F1}",
                    ElapsedB12Ms(streamOpenStartedAt));

                var deserializeStartedAt = Stopwatch.GetTimestamp();
                contract =
                    await JsonSerializer.DeserializeAsync<NativeGate5B12SaveContract>(
                        projectionStream,
                        new JsonSerializerOptions(JsonSerializerDefaults.Web)) ??
                    throw new InvalidOperationException(
                        "The B12 persistence projection was empty.");
                Logger.LogInformation(
                    "[B12-PERF] phase=persistence-stream-deserialize elapsedMs={ElapsedMs:F1} totalTransferMs={TransferMs:F1}",
                    ElapsedB12Ms(deserializeStartedAt),
                    ElapsedB12Ms(projectionTransferStartedAt));
            }
            catch (Exception exception)
            {
                Logger.LogError(
                    exception,
                    "[B12-PERF] phase=persistence-stream status=FAILED elapsedMs={ElapsedMs:F1}",
                    ElapsedB12Ms(projectionTransferStartedAt));
                throw;
            }

            if (contract.SchemaVersion != 2)
            {
                throw new InvalidOperationException(
                    $"Unsupported B12 persistence schema version {contract.SchemaVersion}.");
            }

            if (!string.Equals(contract.Id, decision.SaveId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    "The B12 persistence projection does not match the active Save generation.");
            }

            var expectedDatasetKey = $"work-orders:{SelectedWorkYear}";
            if (!string.Equals(
                    contract.DatasetKey,
                    expectedDatasetKey,
                    StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    $"The B12 persistence projection belongs to '{contract.DatasetKey}', not '{expectedDatasetKey}'.");
            }

            var preparationStartedAt = Stopwatch.GetTimestamp();
            var preparation = PrepareB12SaveRequest(contract);
            Logger.LogInformation(
                "[B12-PERF] phase=prepare-csharp elapsedMs={ElapsedMs:F1} added={Added} changed={Changed} deleted={Deleted} moved={Moved}",
                ElapsedB12Ms(preparationStartedAt),
                preparation.AddedWorkOrders.Count,
                preparation.ChangedWorkOrders.Count,
                preparation.DeletedWorkOrders.Count,
                preparation.MovedToOtherYearsCount);
            if (!string.IsNullOrWhiteSpace(preparation.ValidationMessage))
            {
                await RejectB12SnapshotAsync(decision.SaveId);
                OperationMessage = preparation.ValidationMessage;
                return;
            }

            if (preparation.MovedToOtherYearsCount > 0)
            {
                var yearsText = string.Join(
                    "، ",
                    preparation.DestinationYears.OrderBy(year => year));

                var confirmed = await JSRuntime.InvokeAsync<bool>(
                    "confirm",
                    $"سيتم نقل {preparation.MovedToOtherYearsCount} أوامر عمل من سنة {SelectedWorkYear} إلى سنة/سنوات {yearsText}. هل تريد متابعة الحفظ؟");

                if (!confirmed)
                {
                    await RejectB12SnapshotAsync(decision.SaveId);
                    OperationMessage = "تم إلغاء الحفظ. التغييرات ما زالت Dirty.";
                    return;
                }

                var lockDecision =
                    await GridModule.InvokeAsync<NativeGate5B12LockDecision>(
                        "lockCrossYearSave",
                        GridElementId,
                        decision.SaveId,
                        preparation.MovedClientKeys);

                if (!lockDecision.Allowed)
                {
                    await RejectB12SnapshotAsync(decision.SaveId);
                    OperationMessage =
                        "لم يبدأ الحفظ لأن أحد أوامر العمل المنقولة تعدّل بعد بدء Save. اضغط Save مرة أخرى للحفاظ على أحدث تعديل.";
                    return;
                }
            }

            OperationMessage =
                $"جارٍ حفظ {preparation.AddedWorkOrders.Count + preparation.ChangedWorkOrders.Count + preparation.DeletedWorkOrders.Count} صف...";
            StateHasChanged();

            var serviceStages = new List<WorkOrderServicePerformanceStage>();
            var serviceStartedAt = Stopwatch.GetTimestamp();
            var result = await WorkOrderService.SaveChangesAsync(
                CurrentUserId,
                SelectedWorkYear,
                preparation.AddedWorkOrders,
                preparation.ChangedWorkOrders,
                preparation.DeletedWorkOrders,
                contract.CustomColumns,
                contract.CustomColumnsChanged,
                performanceStages: serviceStages);
            Logger.LogInformation(
                "[B12-PERF] phase=work-order-service elapsedMs={ElapsedMs:F1} succeeded={Succeeded} stages={StageCount}",
                ElapsedB12Ms(serviceStartedAt),
                result.Succeeded,
                serviceStages.Count);
            foreach (var stage in serviceStages)
            {
                Logger.LogInformation(
                    "[B12-PERF] server-stage={StageName} elapsedMs={ElapsedMs:F1} metadata={Metadata}",
                    stage.Name,
                    stage.DurationMs,
                    stage.Metadata is null ? "-" : JsonSerializer.Serialize(stage.Metadata));
            }

            if (!result.Succeeded)
            {
                await RejectB12SnapshotAsync(decision.SaveId);
                OperationMessage = FormatB12Failure(result);
                return;
            }

            // SaveChangesAsync returns success only after the transaction has
            // committed. Mark that boundary before any browser-reconcile work
            // so a later local exception can never cause the same SQL Save to
            // run again.
            PendingCommittedB12SaveId = decision.SaveId;
            PendingCommittedB12MovedCount = preparation.MovedToOtherYearsCount;

            var reconcileStartedAt = Stopwatch.GetTimestamp();
            var reconcile = BuildB12ReconcileResult(result, preparation);
            Logger.LogInformation(
                "[B12-PERF] phase=build-reconcile elapsedMs={ElapsedMs:F1} savedRows={SavedRows} removedRows={RemovedRows}",
                ElapsedB12Ms(reconcileStartedAt),
                reconcile.SavedRows.Count,
                reconcile.RemovedClientKeys.Count);
            PendingCommittedB12Reconcile = reconcile;

            var acceptStartedAt = Stopwatch.GetTimestamp();
            var accepted =
                await GridModule.InvokeAsync<NativeGate5B11AcceptSaveResult>(
                    "acceptRealDbSaveResult",
                    GridElementId,
                    decision.SaveId,
                    reconcile);
            Logger.LogInformation(
                "[B12-PERF] phase=browser-reconcile elapsedMs={ElapsedMs:F1} dirty={Dirty} dirtyCount={DirtyCount} totalSaveMs={TotalSaveMs:F1}",
                ElapsedB12Ms(acceptStartedAt),
                accepted.Dirty,
                accepted.DirtyCount,
                ElapsedB12Ms(overallSaveStartedAt));

            DisplayedRowCount = accepted.RowCount;
            ClearPendingB12CommittedResult();

            if (preparation.MovedToOtherYearsCount > 0)
            {
                await GridModule.InvokeVoidAsync(
                    "clearSheetHistory",
                    GridElementId);
            }

            OperationMessage = accepted.Dirty
                ? $"تم الحفظ في قاعدة البيانات؛ توجد {accepted.DirtyCount} تغييرات أحدث ما زالت Dirty."
                : "تم الحفظ في قاعدة البيانات بنجاح.";
        }
        catch (JSDisconnectedException)
        {
        }
        catch (Exception exception)
        {
            Logger.LogError(exception, "Gate 5B-12 real database Save failed.");

            if (!string.IsNullOrWhiteSpace(PendingCommittedB12SaveId))
            {
                // SQL commit is already known to have succeeded. Never reject
                // this generation back into a fresh SQL Save. If the reconcile
                // payload exists, Save retries browser reconciliation only; if
                // payload construction failed, a page reload is the safe path.
                OperationMessage = PendingCommittedB12Reconcile is not null
                    ? "تم الحفظ في قاعدة البيانات، لكن تعذر تحديث الشيت محليًا. اضغط Save لإعادة تطبيق نتيجة الحفظ فقط؛ لن يتم إرسال SQL مرة أخرى."
                    : "تم الحفظ في قاعدة البيانات، لكن تعذر تجهيز تحديث الشيت محليًا. أعد تحميل الصفحة؛ لن يتم إرسال SQL مرة أخرى.";
            }
            else
            {
                if (!string.IsNullOrWhiteSpace(decision?.SaveId))
                {
                    await RejectB12SnapshotAsync(decision.SaveId);
                }
                OperationMessage = "تعذر إكمال الحفظ. التغييرات الحالية ما زالت Dirty.";
            }
        }
        finally
        {
            IsSaveHandshakeInFlight = false;
            StateHasChanged();
        }
    }

    private async Task RetryCommittedB12ReconcileAsync()
    {
        if (GridModule is null ||
            string.IsNullOrWhiteSpace(PendingCommittedB12SaveId) ||
            PendingCommittedB12Reconcile is null)
        {
            return;
        }

        IsSaveHandshakeInFlight = true;
        StateHasChanged();

        try
        {
            // Keep committed-result recovery on a tiny JS -> .NET boundary.
            // getSaveHandshakeDiagnostics returns the full B11 contract and can
            // exceed SignalR's normal message limit for a large Save generation.
            // The active Save id is all recovery needs to decide whether browser
            // reconciliation still remains pending.
            var activeSaveId =
                await GridModule.InvokeAsync<string?>(
                    "getActiveSaveId",
                    GridElementId);

            if (string.IsNullOrWhiteSpace(activeSaveId))
            {
                // The browser may have completed reconciliation and only the
                // Blazor acknowledgement was lost. Never re-run SQL.
                ClearPendingB12CommittedResult();
                OperationMessage = "الحفظ كان قد اكتمل في قاعدة البيانات والشيت.";
                return;
            }

            if (!string.Equals(
                    activeSaveId,
                    PendingCommittedB12SaveId,
                    StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    "The browser Save generation does not match the committed server result.");
            }

            var accepted =
                await GridModule.InvokeAsync<NativeGate5B11AcceptSaveResult>(
                    "acceptRealDbSaveResult",
                    GridElementId,
                    PendingCommittedB12SaveId,
                    PendingCommittedB12Reconcile);

            DisplayedRowCount = accepted.RowCount;
            var movedCount = PendingCommittedB12MovedCount;
            ClearPendingB12CommittedResult();

            if (movedCount > 0)
            {
                await GridModule.InvokeVoidAsync("clearSheetHistory", GridElementId);
            }

            OperationMessage = accepted.Dirty
                ? $"تمت إعادة تطبيق نتيجة الحفظ؛ توجد {accepted.DirtyCount} تغييرات أحدث ما زالت Dirty."
                : "تمت إعادة تطبيق نتيجة الحفظ بنجاح.";
        }
        catch (Exception exception)
        {
            Logger.LogError(exception, "Gate 5B-12 committed result reconciliation retry failed.");
            OperationMessage =
                "قاعدة البيانات محفوظة بالفعل، لكن تحديث الشيت ما زال متعذرًا. لا تعِد تنفيذ الحفظ كعملية جديدة.";
        }
        finally
        {
            IsSaveHandshakeInFlight = false;
            StateHasChanged();
        }
    }

    private static double ElapsedB12Ms(long startedAt) =>
        Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;

    private void ClearPendingB12CommittedResult()
    {
        PendingCommittedB12SaveId = null;
        PendingCommittedB12Reconcile = null;
        PendingCommittedB12MovedCount = 0;
    }

    private async Task RejectB12SnapshotAsync(string saveId)
    {
        if (GridModule is null)
        {
            return;
        }

        try
        {
            await GridModule.InvokeVoidAsync(
                "rejectSaveHandshake",
                GridElementId,
                saveId);
        }
        catch (JSDisconnectedException)
        {
        }
    }

    private NativeGate5B12PreparedSave PrepareB12SaveRequest(
        NativeGate5B12SaveContract contract)
    {
        var prepared = new NativeGate5B12PreparedSave();

        foreach (var changed in contract.ChangedRecords)
        {
            var row = changed.Row;
            var rawChangedFields = changed.ChangedFields ?? [];
            var changedFields = new HashSet<string>(
                WorkOrderFieldRegistry.NormalizeChangedFields(
                    rawChangedFields,
                    defaultToAll: false),
                StringComparer.Ordinal);

            if (rawChangedFields.Any(field =>
                field?.StartsWith("custom_", StringComparison.Ordinal) == true))
            {
                changedFields.Add(WorkOrderFieldRegistry.CustomValues);
            }

            if (
                row.Id > 0 &&
                changed.RowState?.Baseline?.Exists == true &&
                changed.RowState.State?.Exists == true &&
                changed.RowState.Baseline.DisplayOrder != changed.RowState.State.DisplayOrder)
            {
                changedFields.Add(WorkOrderFieldRegistry.DisplayOrder);
            }

            if (row.Id <= 0 && IsB12CompletelyBlank(row))
            {
                prepared.ValidationMessage =
                    "تعذر الحفظ: أكمل بيانات الصفوف الجديدة أو احذف الصفوف الفارغة أولًا.";
                return prepared;
            }

            if (!TryParseB12AssignmentDate(row.AssignmentDate, out var assignmentDate))
            {
                prepared.ValidationMessage =
                    $"تعذر الحفظ: تاريخ الإسناد غير صحيح في أمر العمل {row.WorkOrderNumber}.";
                return prepared;
            }

            if (!TryParseB12Amount(row.WorkOrderValue, out var workOrderValue))
            {
                prepared.ValidationMessage =
                    $"تعذر الحفظ: قيمة أمر العمل غير صحيحة في أمر العمل {row.WorkOrderNumber}.";
                return prepared;
            }

            if (!TryParseB12Amount(row.PartialAmount, out var partialAmount))
            {
                prepared.ValidationMessage =
                    $"تعذر الحفظ: المبلغ الجزئي غير صحيح في أمر العمل {row.WorkOrderNumber}.";
                return prepared;
            }

            var destinationYear = assignmentDate?.Year ?? SelectedWorkYear;
            if (
                destinationYear != SelectedWorkYear &&
                (row.Id <= 0 || changedFields.Contains(WorkOrderFieldRegistry.AssignmentDate)))
            {
                prepared.MovedToOtherYearsCount++;
                prepared.DestinationYears.Add(destinationYear);
                if (!string.IsNullOrWhiteSpace(changed.ClientKey))
                {
                    prepared.MovedClientKeys.Add(changed.ClientKey.Trim());
                }
            }

            var workOrder = new WorkOrder
            {
                Id = row.Id,
                RowVersion = DecodeB12RowVersion(row.RowVersion),
                WorkYear = destinationYear,
                DisplayOrder = row.DisplayOrder,
                WorkOrderNumber = row.WorkOrderNumber ?? string.Empty,
                WorkTypeCode = row.WorkTypeCode ?? string.Empty,
                AssignmentDate = assignmentDate,
                WorkOrderValue = workOrderValue,
                PartialAmount = partialAmount,
                Busket = row.Basket ?? string.Empty,
                CustomValuesJson = BuildB12CustomValuesJson(
                    row,
                    contract.CustomColumns)
            };

            var clientKey = changed.ClientKey?.Trim() ?? string.Empty;
            if (row.Id <= 0)
            {
                prepared.AddedWorkOrders.Add(workOrder);
                prepared.AddedClientKeyByWorkOrder[workOrder] = clientKey;
            }
            else
            {
                if (changedFields.Count == 0)
                {
                    prepared.ValidationMessage =
                        $"تعذر الحفظ: لم يتم تحديد الحقل المتغير للصف {row.WorkOrderNumber}.";
                    return prepared;
                }

                prepared.ChangedWorkOrders.Add(
                    new WorkOrderChangeSet(workOrder, changedFields));
                prepared.ClientKeyByDatabaseId[row.Id] = clientKey;
            }
        }

        foreach (var deleted in contract.DeletedRecords)
        {
            if (deleted.Id <= 0)
            {
                continue;
            }

            prepared.DeletedWorkOrders.Add(new WorkOrder
            {
                Id = deleted.Id,
                RowVersion = DecodeB12RowVersion(deleted.RowVersion),
                WorkYear = SelectedWorkYear
            });
            prepared.DeletedClientKeyByDatabaseId[deleted.Id] = deleted.ClientKey;
        }

        return prepared;
    }

    private NativeGate5B12ReconcileResult BuildB12ReconcileResult(
        WorkOrderSaveResult result,
        NativeGate5B12PreparedSave preparation)
    {
        foreach (var pair in preparation.AddedClientKeyByWorkOrder)
        {
            if (pair.Key.Id > 0)
            {
                preparation.ClientKeyByDatabaseId[pair.Key.Id] = pair.Value;
            }
        }

        var reconcile = new NativeGate5B12ReconcileResult();
        reconcile.SavedCustomColumns = (result.SavedCustomColumns ?? []).ToList();

        foreach (var saved in result.SavedRecords ?? [])
        {
            var hasClientKey =
                preparation.ClientKeyByDatabaseId.TryGetValue(
                    saved.Id,
                    out var clientKey);

            if (saved.WorkYear != SelectedWorkYear)
            {
                // Cross-year moves originate from an explicit browser row, so
                // the browser-owned ClientKey must already be known here.
                if (!hasClientKey)
                {
                    throw new InvalidOperationException(
                        $"Could not resolve ClientKey for moved Work Order {saved.Id}.");
                }

                reconcile.RemovedClientKeys.Add(clientKey!);
                continue;
            }

            // Deleting a persisted Custom Column can update Work Orders that
            // were not directly edited in the browser because their JSON values
            // must be removed and their SQL RowVersion advances. Those rows do
            // not exist in the compact browser Save projection, so let the
            // browser resolve its own ClientKey from the returned database Id.
            var row = new NativeGate5ARow
            {
                ClientKey = hasClientKey ? clientKey! : string.Empty,
                Id = saved.Id,
                DisplayOrder = saved.DisplayOrder,
                WorkOrderNumber = saved.WorkOrderNumber,
                WorkTypeCode = saved.WorkTypeCode,
                AssignmentDate = saved.AssignmentDate?.ToString(
                    "dd/MM/yyyy",
                    CultureInfo.InvariantCulture) ?? string.Empty,
                WorkOrderValue = saved.WorkOrderValue,
                PartialAmount = saved.PartialAmount,
                RemainingAmount = WorkOrderFinancialRules.CalculateRemainingAmount(
                    saved.WorkOrderValue,
                    saved.PartialAmount),
                Basket = saved.Busket,
                RowVersion = Convert.ToBase64String(saved.RowVersion)
            };

            foreach (var pair in CustomColumnService.DeserializeValues(saved.CustomValuesJson))
            {
                row.CustomFields[pair.Key] = JsonSerializer.SerializeToElement(pair.Value);
            }

            reconcile.SavedRows.Add(row);
        }

        foreach (var deletedId in result.DeletedRecordIds ?? [])
        {
            if (preparation.DeletedClientKeyByDatabaseId.TryGetValue(deletedId, out var clientKey))
            {
                reconcile.RemovedClientKeys.Add(clientKey);
            }
        }

        reconcile.RemovedClientKeys = reconcile.RemovedClientKeys
            .Distinct(StringComparer.Ordinal)
            .ToList();

        return reconcile;
    }

    private static string BuildB12CustomValuesJson(
        NativeGate5B12InputRow row,
        IReadOnlyCollection<CustomColumnDefinitionInput> snapshotColumns)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        var allowedKeys = snapshotColumns
            .Where(column => !column.IsDeleted)
            .Select(column => column.FieldKey)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var pair in row.CustomFields)
        {
            if (!pair.Key.StartsWith("custom_", StringComparison.Ordinal) ||
                !allowedKeys.Contains(pair.Key))
            {
                continue;
            }

            var text = pair.Value.ValueKind == JsonValueKind.String
                ? pair.Value.GetString() ?? string.Empty
                : pair.Value.ToString();

            if (!string.IsNullOrWhiteSpace(text))
            {
                values[pair.Key] = text;
            }
        }

        return JsonSerializer.Serialize(values);
    }

    private static bool IsB12CompletelyBlank(NativeGate5B12InputRow row) =>
        string.IsNullOrWhiteSpace(row.WorkOrderNumber) &&
        string.IsNullOrWhiteSpace(row.WorkTypeCode) &&
        string.IsNullOrWhiteSpace(row.AssignmentDate) &&
        IsB12BlankJsonValue(row.WorkOrderValue) &&
        IsB12BlankJsonValue(row.PartialAmount) &&
        string.IsNullOrWhiteSpace(row.Basket) &&
        !row.CustomFields.Any(pair =>
            pair.Key.StartsWith("custom_", StringComparison.Ordinal) &&
            !string.IsNullOrWhiteSpace(
                pair.Value.ValueKind == JsonValueKind.String
                    ? pair.Value.GetString()
                    : pair.Value.ToString()));

    private static bool IsB12BlankJsonValue(JsonElement value) =>
        value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null ||
        (value.ValueKind == JsonValueKind.String &&
         string.IsNullOrWhiteSpace(value.GetString()));

    private static bool TryParseB12Amount(
        JsonElement value,
        out decimal? amount)
    {
        amount = null;

        if (value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        {
            return true;
        }

        if (value.ValueKind == JsonValueKind.Number)
        {
            if (!value.TryGetDecimal(out var numericAmount))
            {
                return false;
            }

            amount = WorkOrderFinancialRules.NormalizeAmount(numericAmount);
            return true;
        }

        if (value.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        var text = value.GetString();
        if (string.IsNullOrWhiteSpace(text))
        {
            return true;
        }

        var normalized = new string(
            text
                .Trim()
                .Select(character =>
                    character switch
                    {
                        >= '\u0660' and <= '\u0669' =>
                            (char)('0' + character - '\u0660'),

                        >= '\u06F0' and <= '\u06F9' =>
                            (char)('0' + character - '\u06F0'),

                        '\u066B' => '.',
                        _ => character
                    })
                .Where(character =>
                    character != ',' &&
                    character != '\u066C' &&
                    character != ' ' &&
                    character != '\u00A0' &&
                    character != '\u202F')
                .ToArray());

        if (!decimal.TryParse(
                normalized,
                NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture,
                out var parsedAmount))
        {
            return false;
        }

        amount = WorkOrderFinancialRules.NormalizeAmount(parsedAmount);
        return true;
    }

    private static bool TryParseB12AssignmentDate(
        string? value,
        out DateTime? assignmentDate)
    {
        assignmentDate = null;
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        if (!DateTime.TryParseExact(
                value.Trim(),
                "dd/MM/yyyy",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var parsed))
        {
            return false;
        }

        assignmentDate = parsed.Date;
        return true;
    }

    private static byte[] DecodeB12RowVersion(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return [];
        }

        try
        {
            return Convert.FromBase64String(value);
        }
        catch (FormatException)
        {
            return [];
        }
    }

    private static string FormatB12Failure(WorkOrderSaveResult result) =>
        result.FailureType switch
        {
            WorkOrderSaveFailureType.Concurrency =>
                "فشل الحفظ: تم تعديل/حذف أمر عمل من جلسة أخرى. لم يتم فقد تغييراتك.",
            WorkOrderSaveFailureType.Duplicate =>
                "فشل الحفظ: يوجد أمر عمل مكرر. لم يتم فقد تغييراتك.",
            WorkOrderSaveFailureType.Validation =>
                $"فشل الحفظ: {result.ErrorMessage}",
            WorkOrderSaveFailureType.Scope =>
                "فشل الحفظ: المستخدم الحالي لا يملك صلاحية حفظ هذه البيانات.",
            _ => "فشل الحفظ في قاعدة البيانات. لم يتم فقد تغييراتك."
        };

    private sealed class NativeGate5B12PersistenceProjectionMetrics
    {
        public string SaveId { get; set; } = string.Empty;
        public int SchemaVersion { get; set; }
        public int ChangedRecordCount { get; set; }
        public int DeletedRecordCount { get; set; }
        public long Bytes { get; set; }
        public double BuildMs { get; set; }
    }

    private sealed class NativeGate5B12SaveContract
    {
        public int SchemaVersion { get; set; }
        public string Id { get; set; } = string.Empty;
        public string DatasetKey { get; set; } = string.Empty;
        public long Revision { get; set; }
        public bool CustomColumnsChanged { get; set; }
        public List<CustomColumnDefinitionInput> CustomColumns { get; set; } = [];
        public List<NativeGate5B12ChangedRecord> ChangedRecords { get; set; } = [];
        public List<NativeGate5B12DeletedRecord> DeletedRecords { get; set; } = [];
    }

    private sealed class NativeGate5B12ChangedRecord
    {
        public string ClientKey { get; set; } = string.Empty;
        public List<string> ChangedFields { get; set; } = [];
        public NativeGate5B12RowStateChange? RowState { get; set; }
        public NativeGate5B12InputRow Row { get; set; } = new();
    }

    private sealed class NativeGate5B12InputRow
    {
        public string? ClientKey { get; set; }
        public int Id { get; set; }
        public long DisplayOrder { get; set; }
        public string WorkOrderNumber { get; set; } = string.Empty;
        public string WorkTypeCode { get; set; } = string.Empty;
        public string AssignmentDate { get; set; } = string.Empty;
        public JsonElement WorkOrderValue { get; set; }
        public JsonElement PartialAmount { get; set; }
        public JsonElement RemainingAmount { get; set; }
        public string Basket { get; set; } = string.Empty;
        public string RowVersion { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonExtensionData]
        public Dictionary<string, JsonElement> CustomFields { get; set; } =
            new(StringComparer.Ordinal);
    }

    private sealed class NativeGate5B12RowStateChange
    {
        public NativeGate5B12RowState? Baseline { get; set; }
        public NativeGate5B12RowState? State { get; set; }
    }

    private sealed class NativeGate5B12RowState
    {
        public bool Exists { get; set; }
        public long? DisplayOrder { get; set; }
    }

    private sealed class NativeGate5B12DeletedRecord
    {
        public string ClientKey { get; set; } = string.Empty;
        public int Id { get; set; }
        public string RowVersion { get; set; } = string.Empty;
    }

    private sealed class NativeGate5B12PreparedSave
    {
        public List<WorkOrder> AddedWorkOrders { get; } = [];
        public List<WorkOrderChangeSet> ChangedWorkOrders { get; } = [];
        public List<WorkOrder> DeletedWorkOrders { get; } = [];
        public Dictionary<WorkOrder, string> AddedClientKeyByWorkOrder { get; } = [];
        public Dictionary<int, string> ClientKeyByDatabaseId { get; } = [];
        public Dictionary<int, string> DeletedClientKeyByDatabaseId { get; } = [];
        public int MovedToOtherYearsCount { get; set; }
        public HashSet<int> DestinationYears { get; } = [];
        public List<string> MovedClientKeys { get; } = [];
        public string? ValidationMessage { get; set; }
    }

    private sealed class NativeGate5B12LockDecision
    {
        public bool Allowed { get; set; }
        public string? Reason { get; set; }
    }

    private sealed class NativeGate5B12ReconcileResult
    {
        public List<NativeGate5ARow> SavedRows { get; set; } = [];
        public List<string> RemovedClientKeys { get; set; } = [];
        public List<CustomColumnDefinitionData> SavedCustomColumns { get; set; } = [];
    }
}
