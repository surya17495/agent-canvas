import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import {
  getCloudInstallations,
  getCloudRepositoryBranches,
  searchCloudRepositories,
} from "#/api/cloud/git-service.api";

vi.mock("axios");

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

const emptyBranchPage = {
  data: { items: [], next_page_id: null },
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([cloudBackend]);
  setActiveSelection({ backendId: cloudBackend.id });
  vi.mocked(axios.request).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("getCloudRepositoryBranches", () => {
  it("includes an empty query parameter when listing all branches so the upstream schema is satisfied", async () => {
    // Arrange
    vi.mocked(axios.request).mockResolvedValueOnce(emptyBranchPage);

    // Act
    await getCloudRepositoryBranches({
      provider: "github",
      repository: "hieptl/hieptl",
    });

    // Assert
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    const url = (config as { url: string }).url;
    expect(config).toMatchObject({ method: "GET" });
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({
      provider: "github",
      repository: "hieptl/hieptl",
      limit: "30",
      query: "",
    });
  });

  it("forwards a non-empty query parameter when searching branches", async () => {
    // Arrange
    vi.mocked(axios.request).mockResolvedValueOnce(emptyBranchPage);

    // Act
    await getCloudRepositoryBranches({
      provider: "github",
      repository: "hieptl/hieptl",
      query: "feature/login",
    });

    // Assert
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    const url = (config as { url: string }).url;
    expect(url).toContain("query=feature%2Flogin");
  });

  it("forwards branch pagination and normalizes absent response fields", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({ data: null });
    await expect(
      getCloudRepositoryBranches({
        provider: "github",
        repository: "owner/repo",
        query: "feature",
        pageId: "next",
        limit: 4,
      }),
    ).resolves.toEqual({ items: [], next_page_id: null });
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect((config as { url: string }).url).toContain(
      "provider=github&repository=owner%2Frepo&limit=4&query=feature&page_id=next",
    );
  });
});

describe("cloud repository and installation searches", () => {
  it("forwards every repository search option and returns the page", async () => {
    const page = {
      items: [{ id: "1", full_name: "owner/repo" }],
      next_page_id: "next",
    };
    vi.mocked(axios.request).mockResolvedValueOnce({ data: page });
    await expect(
      searchCloudRepositories({
        provider: "github",
        query: "repo",
        pageId: "page",
        installationId: "install",
        limit: 5,
      }),
    ).resolves.toEqual(page);
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect((config as { url: string }).url).toContain(
      "provider=github&limit=5&query=repo&page_id=page&installation_id=install",
    );
  });

  it("uses repository defaults and normalizes an absent response", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({ data: null });
    await expect(
      searchCloudRepositories({ provider: "github" }),
    ).resolves.toEqual({ items: [], next_page_id: null });
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    const request = config as { method: string; url: string };
    expect(request.method).toBe("GET");
    expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
      provider: "github",
      limit: "100",
    });
  });

  it("forwards installation pagination and returns the page", async () => {
    const page = { items: ["installation"], next_page_id: "next" };
    vi.mocked(axios.request).mockResolvedValueOnce({ data: page });
    await expect(
      getCloudInstallations({ provider: "gitlab", pageId: "page", limit: 6 }),
    ).resolves.toEqual(page);
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect((config as { url: string }).url).toContain(
      "provider=gitlab&limit=6&page_id=page",
    );
  });

  it("uses installation defaults and normalizes an absent response", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({ data: null });
    await expect(getCloudInstallations({ provider: "github" })).resolves.toEqual(
      { items: [], next_page_id: null },
    );
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    const request = config as { method: string; url: string };
    expect(request.method).toBe("GET");
    expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
      provider: "github",
      limit: "100",
    });
  });

  it("rejects direct cloud git calls for a local backend", async () => {
    setRegisteredBackends([
      {
        id: "local",
        name: "Local",
        host: "http://localhost:8000",
        apiKey: "key",
        kind: "local",
      },
    ]);
    setActiveSelection({ backendId: "local" });
    await expect(getCloudInstallations({ provider: "github" })).rejects.toThrow(
      "Cloud git call requires a cloud backend.",
    );
  });
});
