export const REVO_GRID_PERSISTENCE_SCHEMA_VERSION = 2;

const IDENTITY_FIELDS = new Set(["workOrderNumber", "workTypeCode"]);
const FINANCIAL_FIELDS = new Set(["workOrderValue", "partialAmount"]);

function cloneValue(value) {
    if (value === undefined) {
        return undefined;
    }
    if (typeof structuredClone === "function") {
        try {
            return structuredClone(value);
        } catch {
        }
    }
    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return value;
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

function copyField(target, source, field) {
    if (source && Object.prototype.hasOwnProperty.call(source, field)) {
        target[field] = cloneValue(source[field]);
    }
}

function buildPersistenceRow(record) {
    const row = record?.row ?? {};
    const changedFields = new Set(
        (Array.isArray(record?.changedFields) ? record.changedFields : [])
            .map(field => String(field ?? "").trim())
            .filter(Boolean)
    );
    const identity = record?.identity ?? {};
    const id = Number(row?.id ?? identity?.id ?? 0);
    const persisted = Number.isInteger(id) && id > 0;

    const projected = {
        clientKey: String(record?.clientKey ?? row?.clientKey ?? "").trim(),
        id: persisted ? id : 0,
        rowVersion: persisted
            ? String(row?.rowVersion ?? identity?.rowVersion ?? "")
            : "",
        // WorkOrderService orders update preparation by DisplayOrder. Keep the
        // tiny structural position for every changed row even when it was not
        // the edited business field.
        displayOrder: Number(row?.displayOrder ?? 0)
    };

    if (!persisted) {
        for (const field of [
            "workOrderNumber",
            "workTypeCode",
            "assignmentDate",
            "workOrderValue",
            "partialAmount",
            "basket"
        ]) {
            copyField(projected, row, field);
        }
    } else {
        if ([...IDENTITY_FIELDS].some(field => changedFields.has(field))) {
            // Duplicate validation needs the complete identity pair.
            copyField(projected, row, "workOrderNumber");
            copyField(projected, row, "workTypeCode");
        }

        if (changedFields.has("assignmentDate")) {
            copyField(projected, row, "assignmentDate");
        }

        if ([...FINANCIAL_FIELDS].some(field => changedFields.has(field))) {
            // Financial validation depends on both values even when the user
            // changed only one of them.
            copyField(projected, row, "workOrderValue");
            copyField(projected, row, "partialAmount");
        }

        if (changedFields.has("basket")) {
            copyField(projected, row, "basket");
        }
    }

    const includeCustomValues =
        !persisted ||
        Array.from(changedFields).some(field => field.startsWith("custom_")) ||
        changedFields.has("customValues");

    if (includeCustomValues) {
        for (const [field, value] of Object.entries(row)) {
            if (field.startsWith("custom_")) {
                projected[field] = cloneValue(value);
            }
        }
    }

    return projected;
}

/**
 * Convert the browser-local B11 Save generation into the stable persistence
 * boundary used by B12. The full B11 contract remains local for Accept/Reject;
 * this payload contains only data required by WorkOrderService plus stable
 * identity/generation metadata.
 *
 * The schema/version boundary is intentionally suitable for future IndexedDB
 * persistence and offline sync, but B12 does not yet claim durable offline or
 * server idempotency semantics.
 */
export function buildRevoGridPersistenceProjection(contract) {
    if (!contract?.id) {
        throw new Error("A persistence projection requires an active Save id.");
    }

    return {
        schemaVersion: REVO_GRID_PERSISTENCE_SCHEMA_VERSION,
        id: String(contract.id),
        datasetKey: String(contract.datasetKey ?? ""),
        revision: Number(contract.revision ?? 0),
        customColumnsChanged: contract.customColumnsChanged === true,
        customColumns: cloneValue(contract.customColumns ?? []),
        changedRecords: (Array.isArray(contract.changedRecords)
            ? contract.changedRecords
            : []).map(record => ({
                clientKey: String(record?.clientKey ?? "").trim(),
                changedFields: cloneValue(record?.changedFields ?? []),
                rowState: cloneValue(record?.rowState ?? null),
                row: buildPersistenceRow(record)
            })),
        deletedRecords: cloneValue(contract.deletedRecords ?? [])
    };
}

export function encodeRevoGridPersistenceProjection(contract) {
    const projection = buildRevoGridPersistenceProjection(contract);
    const bytes = new TextEncoder().encode(JSON.stringify(projection));
    return { projection, bytes };
}
