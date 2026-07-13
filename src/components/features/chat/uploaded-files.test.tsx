import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadedFiles } from "./uploaded-files";

const mockUseConversationStore = vi.hoisted(() => vi.fn());

vi.mock("#/stores/conversation-store", () => ({
  useConversationStore: mockUseConversationStore,
}));

vi.mock("./uploaded-file", () => ({
  UploadedFile: ({
    file,
    onRemove,
    isLoading,
  }: {
    file: File;
    onRemove: () => void;
    isLoading: boolean;
  }) => (
    <button
      type="button"
      data-testid="uploaded-file"
      data-name={file.name}
      data-loading={String(isLoading)}
      onClick={onRemove}
    >
      {file.name}
    </button>
  ),
}));

vi.mock("./uploaded-image", () => ({
  UploadedImage: ({
    image,
    onRemove,
    isLoading,
    showUploadAsFileToggle,
    uploadAsFileActive,
    onToggleUploadAsFile,
  }: {
    image: File;
    onRemove: () => void;
    isLoading: boolean;
    showUploadAsFileToggle: boolean;
    uploadAsFileActive: boolean;
    onToggleUploadAsFile: () => void;
  }) => (
    <section
      data-testid="uploaded-image"
      data-name={image.name}
      data-loading={String(isLoading)}
      data-show-toggle={String(showUploadAsFileToggle)}
      data-upload-as-file={String(uploadAsFileActive)}
    >
      <button type="button" onClick={onRemove}>
        remove {image.name}
      </button>
      <button type="button" onClick={onToggleUploadAsFile}>
        toggle {image.name}
      </button>
    </section>
  ),
}));

const removeFile = vi.fn();
const removeImage = vi.fn();
const toggleImageUploadAsFile = vi.fn();

function setStore(
  overrides: Partial<{
    images: File[];
    files: File[];
    loadingFiles: string[];
    loadingImages: string[];
    imagesMarkedUploadAsFile: string[];
  }> = {},
) {
  mockUseConversationStore.mockReturnValue({
    images: [],
    files: [],
    loadingFiles: [],
    loadingImages: [],
    imagesMarkedUploadAsFile: [],
    removeFile,
    removeImage,
    toggleImageUploadAsFile,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setStore();
});

describe("UploadedFiles", () => {
  it("renders nothing while there are no uploaded or loading items", () => {
    const { container } = render(<UploadedFiles />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders regular and loading files with their exact loading state", () => {
    setStore({
      files: [new File(["ready"], "ready.txt"), new File([], "pending.txt")],
      loadingFiles: ["pending.txt", "processing.txt"],
    });

    render(<UploadedFiles />);

    expect(screen.getAllByTestId("uploaded-file")).toHaveLength(4);
    expect(screen.getByText("ready.txt")).toHaveAttribute(
      "data-loading",
      "false",
    );
    expect(screen.getAllByText("pending.txt")[0]).toHaveAttribute(
      "data-loading",
      "true",
    );
    expect(screen.getByText("processing.txt")).toHaveAttribute(
      "data-loading",
      "true",
    );
  });

  it("removes uploaded files by index but keeps loading placeholders inert", () => {
    setStore({
      files: [new File([], "first.txt"), new File([], "second.txt")],
      loadingFiles: ["processing.txt"],
    });

    render(<UploadedFiles />);
    fireEvent.click(screen.getByText("first.txt"));
    fireEvent.click(screen.getByText("second.txt"));
    fireEvent.click(screen.getByText("processing.txt"));

    expect(removeFile).toHaveBeenNthCalledWith(1, 0);
    expect(removeFile).toHaveBeenNthCalledWith(2, 1);
    expect(removeFile).toHaveBeenCalledTimes(2);
  });

  it("renders image status and forwards remove and toggle actions", () => {
    setStore({
      images: [new File([], "diagram.png"), new File([], "photo.jpg")],
      loadingImages: ["photo.jpg", "generating.png"],
      imagesMarkedUploadAsFile: ["diagram.png", "generating.png"],
    });

    render(<UploadedFiles />);

    const images = screen.getAllByTestId("uploaded-image");
    expect(images).toHaveLength(4);
    expect(images[0]).toHaveAttribute("data-name", "diagram.png");
    expect(images[0]).toHaveAttribute("data-loading", "false");
    expect(images[0]).toHaveAttribute("data-show-toggle", "true");
    expect(images[0]).toHaveAttribute("data-upload-as-file", "true");
    expect(images[1]).toHaveAttribute("data-name", "photo.jpg");
    expect(images[1]).toHaveAttribute("data-loading", "true");
    expect(images[1]).toHaveAttribute("data-upload-as-file", "false");
    expect(images[3]).toHaveAttribute("data-name", "generating.png");
    expect(images[3]).toHaveAttribute("data-loading", "true");
    expect(images[3]).toHaveAttribute("data-upload-as-file", "true");

    fireEvent.click(screen.getByRole("button", { name: "remove diagram.png" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "remove photo.jpg" })[0],
    );
    fireEvent.click(
      screen.getByRole("button", { name: "remove generating.png" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "toggle diagram.png" }));
    fireEvent.click(
      screen.getByRole("button", { name: "toggle generating.png" }),
    );

    expect(removeImage).toHaveBeenNthCalledWith(1, 0);
    expect(removeImage).toHaveBeenNthCalledWith(2, 1);
    expect(removeImage).toHaveBeenCalledTimes(2);
    expect(toggleImageUploadAsFile).toHaveBeenNthCalledWith(1, "diagram.png");
    expect(toggleImageUploadAsFile).toHaveBeenNthCalledWith(
      2,
      "generating.png",
    );
  });
});
