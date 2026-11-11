import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { UsersRoundIcon } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { EmptyState } from "@/components/empty-state";
import { FilterSelect } from "@/components/filter-select";
import { PageHeader } from "@/components/page-header";
import { TeamSkeleton } from "@/components/skeletons";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { pickModule } from "@/lib/areas/directory";
import { areaStore } from "@/lib/areas/store";
import { buildTree, canHaveChildren, flatten, MAX_DEPTH, pathTo } from "@/lib/areas/tree";
import { can, ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { requireAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { deleteArea } from "./actions";
import { ModuleList } from "./module-list";
import { AreaDialog } from "./_dialogs/area-dialog";
import { AssignDialog } from "./_dialogs/assign-dialog";
import { MembersDialog } from "./_dialogs/members-dialog";
import type { AreaOption, AreaValues, PersonOption } from "./_dialogs/types";
import { AreaRow, HEAD, type Member } from "./_table/area-row";

export const metadata: Metadata = { title: "Team & modules" };

type SearchParams = Record<string, string | string[] | undefined>;

export default function TeamPage({ searchParams }: PageProps<"/team">) {
  return (
    <Suspense fallback={<TeamSkeleton />}>
      <TeamBody searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * A /team address with the person filter and the open module. It jumps to the module's table, which on a phone or a
 * narrow window sits under the list; on big screens the page doesn't scroll, so nothing moves.
 */
function teamHref(person: string, module: string | null): string {
  const qs = new URLSearchParams();
  if (person) qs.set("person", person);
  if (module) qs.set("module", module);
  const s = qs.toString();
  return `${s ? `/team?${s}` : "/team"}${module ? "#module-title" : ""}`;
}

async function TeamBody({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  await connection();
  const me = await requireAction("team.view");
  // Admins and Team Leads manage this page (areas.manage); everyone else only reads it.
  const admin = can(me, "areas.manage");
  const person = typeof sp.person === "string" ? sp.person : "";
  const wanted = typeof sp.module === "string" ? sp.module : null;

  const store = areaStore(db);
  const [areas, users] = await Promise.all([store.areasWithMembers(), store.activePeople()]);

  const people: PersonOption[] = users.map((u) => ({ id: u.id, name: u.name, role: u.role as Role, designer: u.designer }));
  const rows = areas
    .filter((a) => admin || a.active)
    .map((a) => ({
      ...a,
      members: a.members.map((m): Member => ({ userId: m.user.id, name: m.user.name, role: m.user.role as Role, designer: m.user.designer, isLead: m.isLead, asDesigner: m.asDesigner })),
    }));
  // A module stays for a person when they are in it or in anything inside it, at any level.
  const tree = buildTree(rows).filter((mod) => !person || flatten([mod]).some((a) => a.members.some((m) => m.userId === person)));
  // Where a new or moved area can go: any module or sub-module not already at the last level, by its full path.
  const modules = flatten(buildTree(rows))
    .filter((a) => canHaveChildren(rows, a.id))
    .map((a) => ({ id: a.id, name: pathTo(buildTree(rows), a.id).map((p) => p.name).join(" › ") }));
  // Assign to modules: every module and sub-module, parents before what's inside them.
  const areaOptions: AreaOption[] = flatten(buildTree(rows)).map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    depth: pathTo(buildTree(rows), a.id).length - 1,
    inside: flatten(a.children).map((c) => c.id),
    hidden: !a.active,
  }));
  const toValues = (a: (typeof rows)[number]): AreaValues => ({
    id: a.id,
    name: a.name,
    code: a.code,
    parentId: a.parentId,
    sortOrder: a.sortOrder,
    active: a.active,
  });
  const selectedPerson = users.find((u) => u.id === person);
  const open = pickModule(tree, wanted);
  // Applies on change; the hidden button keeps it working as a plain form. The open module stays open if that person has it.
  const personForm = (
    <form action="/team" className="grid gap-1.5">
      {open ? <input type="hidden" name="module" value={open.id} /> : null}
      <label htmlFor="person" className="text-[0.8438rem] font-medium text-body2">Show modules for</label>
      <FilterSelect
        id="person"
        name="person"
        defaultValue={person}
        options={[
          { value: "", label: "Everyone" },
          ...users.map((u) => ({ value: u.id, label: `${u.name} · ${ROLE_LABELS[u.role as Role]}${u.designer ? " · Designer" : ""}${u.teamLead ? " · Team Lead" : ""}` })),
        ]}
      />
      <Button type="submit" variant="outline" size="sm" className="sr-only focus-visible:not-sr-only">Show</Button>
    </form>
  );

  return (
    // Big screens (D21): the page fits the window; the module list and the owners table scroll inside their cards.
    <div className="grid gap-6 desk:flex desk:h-[calc(100dvh-12.5rem)] desk:min-h-112 desk:flex-col">
      <PageHeader
        title="Team & modules"
        description="Who owns which part of the ERP. Find the right developer before filing a ticket."
        actions={
          admin ? (
            <>
              {areaOptions.length ? <AssignDialog people={people} areas={areaOptions} /> : null}
              <AreaDialog modules={modules} />
            </>
          ) : null
        }
      />

      {tree.length === 0 && person ? (
        // A person with no modules: the filter stays, so another person can be picked straight away.
        <Card className="max-w-sm p-4">{personForm}</Card>
      ) : null}
      {tree.length === 0 ? (
        <EmptyState
          icon={UsersRoundIcon}
          title={person ? `${selectedPerson?.name ?? "This person"} isn't in any module yet` : "No modules yet"}
          action={
            person ? (
              <Button variant="outline" nativeButton={false} render={<Link href="/team" />}>
                Show everyone
              </Button>
            ) : admin ? (
              <AreaDialog modules={modules} />
            ) : null
          }
        >
          {person
            ? "An admin or a Team Lead can add them from the module's Members button."
            : admin
              ? "Add the ERP's modules, then their sub-modules, then assign developers, QA and designers to each."
              : "An admin or a Team Lead hasn't set up the module list yet."}
        </EmptyState>
      ) : (
        <div className="flex flex-wrap items-start gap-6 desk:min-h-0 desk:flex-1 desk:flex-nowrap desk:items-stretch">
          {/* Left: search, the person filter and the module list. */}
          <Card role="region" aria-label="Modules" className="min-w-0 flex-[1_1_17.5rem] gap-3.5 p-4 desk:max-w-[22rem] desk:min-h-0">
            <ModuleList
              modules={tree.map((m) => ({
                id: m.id,
                name: m.name,
                code: m.code,
                children: flatten(m.children).map((c) => ({ name: c.name, code: c.code })),
                href: teamHref(person, m.id),
                selected: m.id === open?.id,
                hidden: !m.active,
              }))}
            >
              {personForm}
            </ModuleList>
          </Card>

          {/* Right: the open module's owners. */}
          {open ? (
            <Card role="region" aria-labelledby="module-title" className="min-w-0 flex-[999_1_35rem] desk:min-h-0">
              <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <h2 id="module-title" className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
                    {open.name}
                    {open.code ? <span className="font-mono text-sm font-medium text-muted-foreground">{open.code}</span> : null}
                    {!open.active ? <StatusPill tone="neutral">Hidden</StatusPill> : null}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {flatten(open.children).length} sub-module{flatten(open.children).length === 1 ? "" : "s"}
                  </p>
                </div>
                {admin ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <AreaDialog modules={modules} parentId={open.id} labelled />
                    <AreaDialog modules={modules} area={toValues(open)} labelled />
                    <MembersDialog areaId={open.id} areaName={open.name} people={people} members={open.members} />
                    <DeleteButton id={open.id} label={open.name} action={deleteArea} detail="Its member list is removed too. This cannot be undone." />
                  </div>
                ) : null}
              </div>
              <div className="overflow-x-auto px-4 pb-4 desk:min-h-0 desk:flex-1 desk:overflow-y-auto desk:overscroll-contain">
                <table aria-label="Owners of each area" className="w-full min-w-[50rem] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className={cn(HEAD, "w-[24%]")}>Area</th>
                      <th scope="col" className={HEAD}>Lead</th>
                      <th scope="col" className={HEAD}>Developers</th>
                      <th scope="col" className={HEAD}>QA</th>
                      <th scope="col" className={HEAD}>UI/UX</th>
                      {admin ? <th scope="col" className={cn(HEAD, "w-28")}><span className="sr-only">Actions</span></th> : null}
                    </tr>
                  </thead>
                  <tbody className="stagger">
                    <AreaRow label="Whole module" muted members={open.members} person={person} admin={admin} />
                    {/* Sub-modules, each followed by what's inside it, indented one step. */}
                    {flatten(open.children).map((sub) => {
                      const path = pathTo([open], sub.id);
                      const depth = path.length - 1;
                      return (
                        <AreaRow
                          key={sub.id}
                          label={sub.name}
                          code={sub.code}
                          depth={depth}
                          hidden={!sub.active}
                          members={sub.members}
                          person={person}
                          admin={admin}
                          actions={
                            <>
                              {depth < MAX_DEPTH - 1 ? <AreaDialog modules={modules} parentId={sub.id} /> : null}
                              <MembersDialog areaId={sub.id} areaName={path.map((p) => p.name).join(" › ")} people={people} members={sub.members} />
                              <AreaDialog modules={modules} area={toValues(sub)} />
                              <DeleteButton
                                id={sub.id}
                                label={sub.name}
                                action={deleteArea}
                                detail={sub.children.length ? "Delete or move what's inside it first." : "Its member list is removed too. This cannot be undone."}
                              />
                            </>
                          }
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
