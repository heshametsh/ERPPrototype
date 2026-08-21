YEAR SELECTOR ISOLATION LAB

Route:
  /year-selector-isolation-lab

This diagnostic page does not modify Work Orders or Gate 5A.
It does not use RevoGrid, SQL, or WorkOrderService.

It compares four Blazor/HTML select implementations under the same async
option-list transition that matches the observed failure shape.

PASS means:
  DOM selected value == C# value == current Saudi business year.

Use the result to choose the selector implementation before changing Gate 5A.
