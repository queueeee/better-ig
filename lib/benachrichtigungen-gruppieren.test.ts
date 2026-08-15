import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gruppieren,
  urheberSatz,
  type RohBenachrichtigung,
} from "./benachrichtigungen-gruppieren.ts";

const like = (
  id: string,
  urheberId: string,
  beitragId: string,
  createdAt: string,
): RohBenachrichtigung => ({
  id,
  typ: "like",
  urheberId,
  beitragId,
  kommentarId: null,
  createdAt,
});

test("fasst Likes am selben Tag zum selben Beitrag zusammen", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-15T10:00:00Z"),
      like("2", "ben", "bild-a", "2026-08-15T09:00:00Z"),
      like("3", "carla", "bild-a", "2026-08-15T08:00:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 1);
  assert.equal(gruppen[0].anzahl, 3);
  assert.deepEqual(gruppen[0].urheberIds, ["anna", "ben", "carla"]);
  assert.equal(gruppen[0].neuestesAm, "2026-08-15T10:00:00Z");
});

test("trennt denselben Beitrag an verschiedenen Tagen", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-15T10:00:00Z"),
      like("2", "ben", "bild-a", "2026-08-14T10:00:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 2);
});

test("trennt verschiedene Beiträge am selben Tag", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-15T10:00:00Z"),
      like("2", "anna", "bild-b", "2026-08-15T09:00:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 2);
});

test("zählt dieselbe Person nur einmal als Urheber, aber zweimal in anzahl", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-15T10:00:00Z"),
      like("2", "anna", "bild-a", "2026-08-15T09:00:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 1);
  assert.deepEqual(gruppen[0].urheberIds, ["anna"]);
  assert.equal(gruppen[0].anzahl, 2);
});

test("die Tagesgrenze ist Berliner Zeit, nicht UTC", () => {
  // 22:30 UTC am 14.8. ist in Berlin bereits der 15.8. um 00:30.
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-14T22:30:00Z"),
      like("2", "ben", "bild-a", "2026-08-14T21:30:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 2);
});

test("folgt-Ereignisse gruppieren ohne Bezug, aber pro Tag", () => {
  const folgt = (
    id: string,
    urheberId: string,
    createdAt: string,
  ): RohBenachrichtigung => ({
    id,
    typ: "folgt",
    urheberId,
    beitragId: null,
    kommentarId: null,
    createdAt,
  });

  const gruppen = gruppieren(
    [
      folgt("1", "anna", "2026-08-15T10:00:00Z"),
      folgt("2", "ben", "2026-08-15T09:00:00Z"),
      folgt("3", "carla", "2026-08-14T09:00:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 2);
  assert.equal(gruppen[0].anzahl, 2);
  assert.equal(gruppen[1].anzahl, 1);
});

test("mischt Typen nicht, auch nicht beim selben Beitrag am selben Tag", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-15T10:00:00Z"),
      {
        id: "2",
        typ: "kommentar",
        urheberId: "ben",
        beitragId: "bild-a",
        kommentarId: "k1",
        createdAt: "2026-08-15T09:00:00Z",
      },
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 2);
});

test("die Gruppe merkt sich den neuesten Kommentar, nicht den ältesten", () => {
  const gruppen = gruppieren(
    [
      {
        id: "1",
        typ: "kommentar",
        urheberId: "anna",
        beitragId: "bild-a",
        kommentarId: "neu",
        createdAt: "2026-08-15T10:00:00Z",
      },
      {
        id: "2",
        typ: "kommentar",
        urheberId: "ben",
        beitragId: "bild-a",
        kommentarId: "alt",
        createdAt: "2026-08-15T09:00:00Z",
      },
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 1);
  assert.equal(gruppen[0].kommentarId, "neu");
});

test("ungelesen richtet sich nach dem neuesten Ereignis der Gruppe", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-15T10:00:00Z"),
      like("2", "ben", "bild-b", "2026-08-15T08:00:00Z"),
    ],
    "2026-08-15T09:00:00Z",
  );

  assert.equal(gruppen[0].ungelesen, true);
  assert.equal(gruppen[1].ungelesen, false);
});

test("Gruppen kommen neueste zuerst, unabhängig von der Eingabereihenfolge", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-alt", "2026-08-10T10:00:00Z"),
      like("2", "ben", "bild-neu", "2026-08-15T10:00:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen[0].beitragId, "bild-neu");
  assert.equal(gruppen[1].beitragId, "bild-alt");
});

test("leere Eingabe ergibt eine leere Liste", () => {
  assert.deepEqual(gruppieren([], "1970-01-01T00:00:00Z"), []);
});

test("urheberSatz nennt höchstens zwei Namen", () => {
  assert.equal(urheberSatz([]), "Jemand");
  assert.equal(urheberSatz(["anna"]), "anna");
  assert.equal(urheberSatz(["anna", "ben"]), "anna und ben");
  assert.equal(
    urheberSatz(["anna", "ben", "carla", "dora", "emil"]),
    "anna, ben und 3 weitere",
  );
});
