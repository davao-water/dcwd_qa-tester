/** The modules filter: admins see everything or one QA tester's modules; others their own or everything. */
export function scopeFor(param: string, admin: boolean, qaTesters: { id: string; name: string }[]) {
  if (admin) {
    const person = qaTesters.find((u) => u.id === param);
    return {
      value: person ? person.id : "all",
      forUserId: person?.id,
      options: [{ value: "all", label: "All modules" }, ...qaTesters.map((u) => ({ value: u.id, label: u.name }))],
    };
  }
  return { value: param === "all" ? "all" : "mine", forUserId: undefined as string | undefined, options: [{ value: "mine", label: "My modules" }, { value: "all", label: "All modules" }] };
}
