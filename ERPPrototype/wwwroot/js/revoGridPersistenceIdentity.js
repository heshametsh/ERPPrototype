function requireText(value, name) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        throw new Error(`${name} is required.`);
    }
    return normalized;
}

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
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

function normalizeDatabaseId(value) {
    const id = Number(value ?? 0);
    return Number.isInteger(id) && id > 0 ? id : 0;
}

function normalizeRowVersion(value) {
    return String(value ?? "").trim();
}

function identityFromRow(row) {
    const clientKey = requireText(row?.clientKey, "row.clientKey");
    const id = normalizeDatabaseId(row?.id);
    const rowVersion = normalizeRowVersion(row?.rowVersion);

    return {
        clientKey,
        id,
        rowVersion,
        persisted: id > 0
    };
}

export function createRevoGridPersistenceIdentity(options = {}) {
    const identities = new Map();

    function replaceRows(rows) {
        identities.clear();
        for (const row of Array.isArray(rows) ? rows : []) {
            const identity = identityFromRow(row);
            if (identities.has(identity.clientKey)) {
                throw new Error(`Duplicate ClientKey '${identity.clientKey}' in persistence identity.`);
            }
            if (identity.persisted && !identity.rowVersion) {
                throw new Error(`Persisted row '${identity.clientKey}' is missing RowVersion.`);
            }
            identities.set(identity.clientKey, identity);
        }
        return getState();
    }

    function getIdentity(clientKey) {
        const key = requireText(clientKey, "clientKey");
        const identity = identities.get(key);
        return identity ? cloneValue(identity) : null;
    }

    function prepareRowForReplay(row) {
        const prepared = cloneValue(row);
        const key = requireText(prepared?.clientKey, "row.clientKey");
        const identity = identities.get(key);
        if (!identity) {
            return prepared;
        }

        prepared.id = identity.persisted ? identity.id : 0;
        prepared.rowVersion = identity.persisted ? identity.rowVersion : "";
        return prepared;
    }

    function reconcileRows(rows) {
        return (Array.isArray(rows) ? rows : []).map(prepareRowForReplay);
    }

    function getDeletedRecords(dirtyRows) {
        const deleted = [];
        for (const change of Array.isArray(dirtyRows) ? dirtyRows : []) {
            if (!change?.baseline?.exists || change?.current?.exists) {
                continue;
            }

            const key = requireText(change.clientKey, "dirtyRow.clientKey");
            const identity = identities.get(key);
            if (!identity?.persisted) {
                continue;
            }
            if (!identity.rowVersion) {
                throw new Error(`Deleted persisted row '${key}' is missing RowVersion.`);
            }

            deleted.push({
                clientKey: key,
                id: identity.id,
                rowVersion: identity.rowVersion
            });
        }
        return deleted;
    }

    function acceptSaveResult(result = {}) {
        const mappings = Array.isArray(result.savedRowMappings)
            ? result.savedRowMappings
            : [];
        const savedRows = Array.isArray(result.savedRows)
            ? result.savedRows
            : [];
        const removedRowIds = new Set(
            (Array.isArray(result.removedRowIds) ? result.removedRowIds : [])
                .map(normalizeDatabaseId)
                .filter(id => id > 0)
        );

        const clientKeyByDatabaseId = new Map();
        for (const mapping of mappings) {
            const clientKey = requireText(mapping?.clientKey, "savedRowMapping.clientKey");
            const databaseId = normalizeDatabaseId(mapping?.databaseId);
            if (databaseId <= 0) {
                throw new Error(`Saved row mapping for '${clientKey}' requires a databaseId.`);
            }
            clientKeyByDatabaseId.set(databaseId, clientKey);
        }

        const currentClientKeyById = new Map();
        for (const identity of identities.values()) {
            if (identity.persisted) {
                currentClientKeyById.set(identity.id, identity.clientKey);
            }
        }

        for (const saved of savedRows) {
            const id = normalizeDatabaseId(saved?.id);
            const rowVersion = normalizeRowVersion(saved?.rowVersion);
            if (id <= 0 || !rowVersion) {
                throw new Error("Every saved row requires Id and RowVersion.");
            }

            const clientKey = String(saved?.clientKey ?? "").trim()
                || clientKeyByDatabaseId.get(id)
                || currentClientKeyById.get(id);
            if (!clientKey) {
                throw new Error(`Could not resolve ClientKey for saved database row '${id}'.`);
            }

            identities.set(clientKey, {
                clientKey,
                id,
                rowVersion,
                persisted: true
            });
        }

        for (const removedId of removedRowIds) {
            const clientKey = currentClientKeyById.get(removedId);
            if (!clientKey) {
                continue;
            }
            identities.set(clientKey, {
                clientKey,
                id: 0,
                rowVersion: "",
                persisted: false
            });
        }

        return getState();
    }

    function getState() {
        let persistedIdentityCount = 0;
        let temporaryIdentityCount = 0;
        let missingRowVersionCount = 0;

        for (const identity of identities.values()) {
            if (identity.persisted) {
                persistedIdentityCount += 1;
                if (!identity.rowVersion) {
                    missingRowVersionCount += 1;
                }
            } else {
                temporaryIdentityCount += 1;
            }
        }

        return {
            identityCount: identities.size,
            persistedIdentityCount,
            temporaryIdentityCount,
            missingRowVersionCount
        };
    }

    function destroy() {
        identities.clear();
    }

    replaceRows(options.rows ?? []);

    return Object.freeze({
        replaceRows,
        getIdentity,
        prepareRowForReplay,
        reconcileRows,
        getDeletedRecords,
        acceptSaveResult,
        getState,
        destroy
    });
}
