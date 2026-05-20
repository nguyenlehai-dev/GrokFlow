// Sentinel the BE recognises as "clear this nullable FK". Used when a
// PATCH body needs to express "set role_id/domain_id/plan_id back to
// NULL" — empty-string and undefined are otherwise ambiguous. Mirrors
// `NULL_FK_SENTINEL` in backend/app/modules/admin/router.py.
export const NULL_FK_SENTINEL = "00000000-0000-0000-0000-000000000000";
