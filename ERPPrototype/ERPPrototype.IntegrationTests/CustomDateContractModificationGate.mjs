import { createRevoGridValidation } from "../wwwroot/js/revoGridValidation.js";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function validate({ assignmentDate = "15/09/2026", customDate }) {
    const rows = [{
        clientKey: "custom-date-gate:1",
        id: 1,
        workOrderNumber: "123456789",
        workTypeCode: "401",
        assignmentDate,
        workOrderValue: 100,
        partialAmount: 0,
        basket: "Open",
        custom_date_gate: customDate
    }];

    const validation = createRevoGridValidation({
        rows,
        basketValues: ["Open"],
        customColumns: [{
            fieldKey: "custom_date_gate",
            name: "Custom Date Gate",
            dataType: "Date"
        }]
    });

    return validation.getState();
}
const earliestFourDigitDate = validate({ customDate: "01/01/0001" });
assert(
    earliestFourDigitDate.canSave,
    "Custom Date 01/01/0001 must be valid under the DD/MM/YYYY calendar contract."
);

const yearZero = validate({ customDate: "01/01/0000" });
assert(
    !yearZero.canSave &&
    yearZero.validationInvalidRows[0]?.fields?.includes("custom_date_gate"),
    "Custom Date year 0000 must remain invalid to match the server calendar range."
);

const before2000 = validate({ customDate: "31/12/1999" });
assert(
    before2000.canSave,
    "Custom Date 31/12/1999 must be valid; WorkYear limits must not apply to Custom Date."
);

const after2100 = validate({ customDate: "01/01/2101" });
assert(
    after2100.canSave,
    "Custom Date 01/01/2101 must be valid; WorkYear limits must not apply to Custom Date."
);

const latestFourDigitDate = validate({ customDate: "31/12/9999" });
assert(
    latestFourDigitDate.canSave,
    "Custom Date 31/12/9999 must be valid under the four-digit calendar contract."
);

const impossibleDate = validate({ customDate: "31/02/2026" });
assert(
    !impossibleDate.canSave &&
    impossibleDate.validationInvalidRows[0]?.fields?.includes("custom_date_gate"),
    "An impossible Custom Date must still be rejected."
);

const guardedWorkYear = validate({
    assignmentDate: "31/12/1999",
    customDate: "31/12/1999"
});
assert(
    !guardedWorkYear.canSave &&
    guardedWorkYear.validationInvalidRows[0]?.fields?.includes("assignmentDate"),
    "Assignment Date must keep the existing 2000-2100 WorkYear guard."
);

console.log("CUSTOM DATE CONTRACT GATE: PASS");
