import { test, expect } from "@playwright/test";

test.describe("API Routes", () => {
  test("GET /api/weeks returns JSON", async ({ request }) => {
    const res = await request.get("/api/weeks");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body) || body.error).toBeTruthy();
  });

  test("GET /api/team returns JSON", async ({ request }) => {
    const res = await request.get("/api/team");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/tasks returns JSON", async ({ request }) => {
    const res = await request.get("/api/tasks");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/tasks with backlog filter returns JSON", async ({
    request,
  }) => {
    const res = await request.get("/api/tasks?backlog=true");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/weeks/:weekStart returns week data", async ({ request }) => {
    // Use current Monday
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.getFullYear(), now.getMonth(), diff);
    const ws = monday.toISOString().split("T")[0];

    const res = await request.get(`/api/weeks/${ws}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("tasks");
  });

  test("POST /api/tasks creates a task", async ({ request }) => {
    const res = await request.post("/api/tasks", {
      data: {
        title: "E2E Test Task",
        status: "todo",
        priority: "low",
        assignee: "Test User",
        taskType: "internal",
      },
    });
    expect(res.status()).toBe(200);
    const task = await res.json();
    expect(task).toHaveProperty("id");
    expect(task.title).toBe("E2E Test Task");

    // Clean up
    if (task.id) {
      const del = await request.delete(`/api/tasks/${task.id}`);
      expect(del.status()).toBe(200);
    }
  });

  test("PATCH /api/tasks/:id updates a task", async ({ request }) => {
    // Create
    const create = await request.post("/api/tasks", {
      data: {
        title: "E2E Patch Test",
        status: "todo",
        priority: "low",
        taskType: "internal",
      },
    });
    const task = await create.json();

    // Patch
    const patch = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: "done", priority: "high" },
    });
    expect(patch.status()).toBe(200);
    const updated = await patch.json();
    expect(updated.status).toBe("done");
    expect(updated.priority).toBe("high");

    // Clean up
    await request.delete(`/api/tasks/${task.id}`);
  });

  test("DELETE /api/tasks/:id deletes a task", async ({ request }) => {
    // Create
    const create = await request.post("/api/tasks", {
      data: {
        title: "E2E Delete Test",
        status: "todo",
        priority: "low",
        taskType: "internal",
      },
    });
    const task = await create.json();

    // Delete
    const del = await request.delete(`/api/tasks/${task.id}`);
    expect(del.status()).toBe(200);
  });
});
