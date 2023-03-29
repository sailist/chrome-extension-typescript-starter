import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { makeButton, copyTextToClipboard, applyStyle } from "./tools";
import { divToMarkdown } from "./markdown";
export class GPTGroup {
  prompt?: HTMLDivElement;
  response?: HTMLDivElement;
  constructor(response: HTMLDivElement) {
    // response element should match selector pattern".group * .markdown"
    this.response = response;
    // this.prompt match the pattern of ".group"
    this.prompt = response.previousElementSibling as HTMLDivElement;
  }

  resubmit(prompt?: string) {
    if (this.prompt) {
      this.prompt.querySelector("button")?.click();
      let textarea = this.prompt.querySelector("textarea");
      if (textarea && prompt) {
        textarea.value = prompt;
      }
      this.prompt.querySelector("button")?.click();
    }
  }
}

export type GptEventNames =
  | "newpage"
  | "response"
  | "stop generation"
  | "textarea create"
  | "regenerate" //
  | "send" //
  | "init send"; //

export class GPTPageHandler {
  groups: GPTGroup[] = [];
  lastGroup?: GPTGroup;

  textarea?: HTMLTextAreaElement;
  sendBt?: HTMLButtonElement;
  newPageBt?: HTMLLinkElement;
  regenerateButton?: HTMLButtonElement;
  eventListeners: { [key in GptEventNames]?: GPTEventListener[] } = {};
  chatProcessors: { [key: string]: GPTEventListener } = {};
  currentEventHandler?: GPTEventListener;
  constructor() {
    this.initialize();
  }
  addChatProcessor(callback: GPTEventListener) {
    this.chatProcessors[callback.plugin_name] = callback;
    callback.bindGPT(this);
  }
  addEventListener(name: GptEventNames, callback: GPTEventListener) {
    console.log("Add " + name + " EventListener: " + callback.plugin_name);
    if (!this.eventListeners[name]) {
      this.eventListeners[name] = [];
    }
    this.eventListeners[name]?.push(callback);
  }

  initialize() {
    this.textarea = document.querySelector(
      "form textarea"
    ) as HTMLTextAreaElement;
    this.sendBt = this.textarea.nextElementSibling as HTMLButtonElement;
    this.groups = Array.from(
      document.querySelectorAll(".group * .markdown")
    ).map((item) => new GPTGroup(item as HTMLDivElement));
    this.lastGroup = this.groups[this.groups.length - 1];

    const xpath = '//a[contains(text(), "New chat")]';
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    if (result.snapshotLength > 0) {
      this.newPageBt = result.snapshotItem(0) as HTMLLinkElement;
    }
  }

  vote(listener: GPTEventListener) {
    let name = listener.plugin_name;
    if (
      this.chatProcessors[name] &&
      this.currentEventHandler != this.chatProcessors[name]
    ) {
      if (this.currentEventHandler) {
        this.currentEventHandler.onUnHooked();
      }
      this.currentEventHandler = this.chatProcessors[name];
      this.currentEventHandler.onHooked();
      return true;
    }
  }

  newpage() {
    this.newPageBt?.click();
  }
  regenerate(edit?: string) {
    this.lastGroup?.resubmit(edit);
  }
  send(value: string) {
    // console.log("send\n" + value);
    // console.log(this);
    if (this.textarea && this.sendBt) {
      this.textarea.value = value;
      this.sendBt.click();
    }
  }
  copyResponse() {}
  copyGroup() {}
  copyAllGroup() {}
  copyAllResponse() {}

  onSwitchPage(old: boolean = false) {
    this.initialize();
    this.currentEventHandler?.onSwitchPage(old);
    this.eventListeners["newpage"]?.forEach((item) => {
      item.onSwitchPage(old);
    });
  }
  onResponse(gptGroup: GPTGroup) {
    this.initialize();
    this.currentEventHandler?.onResponse(this.lastGroup!);
    this.eventListeners["response"]?.forEach((item) => {
      item.onResponse(gptGroup);
    });
  }
  onStopGeneration() {
    this.currentEventHandler?.onStopGeneration();
    this.eventListeners["stop generation"]?.forEach((item) => {
      item.onStopGeneration();
    });
  }
  onTextareaCreate(el: HTMLTextAreaElement) {
    this.textarea = el;
    this.currentEventHandler?.onTextareaCreate(el);
    this.eventListeners["textarea create"]?.forEach((item) => {
      item.onTextareaCreate(el);
    });
  }
}

export interface GPTEventListener {
  plugin_name: string;
  bindGPT(gptpage: GPTPageHandler): void;

  onHooked(): void;
  onUnHooked(): void;

  onSwitchPage(old: boolean): void;
  onResponse(gptGroup: GPTGroup): void;
  onStopGeneration(): void;
  onTextareaCreate(el: HTMLTextAreaElement): void;

  onSendStart(): void;
}

export class PDFProcess implements GPTEventListener {
  plugin_name: string = "pdf_process";
  gptpage?: GPTPageHandler;
  pdf?: PDFDocumentProxy;
  stoped: boolean = false;
  process: number = 0;

  onTextareaCreate(el: HTMLTextAreaElement) {
    const that = this;
    const dropzone = el.parentElement as HTMLElement;
    dropzone.style.border = "2px dashed #ccc";
    console.log("Try Adding dropable");
    if (!dropzone.classList.contains("dropable")) {
      dropzone.addEventListener("dragover", function (e) {
        (e.target as HTMLElement).style.backgroundColor = "";
        e.preventDefault();
        e.stopPropagation();
        this.style.border = "2px dashed #ccc";
      });
      dropzone.addEventListener("dragleave", function (e) {
        this.style.border = "2px dashed #ccc";
        e.preventDefault();
        e.stopPropagation();
        this.style.border = "2px solid #ccc";
      });
      dropzone.addEventListener("drop", function (e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        this.style.border = "2px dashed #ccc";
        if (e.dataTransfer) {
          var file = e.dataTransfer.files[0];
          that.onDropFile(file);
        } else {
          debugger;
        }
      });
      dropzone.classList.add("dropable");
      console.log("Add dropable");
      console.log(dropzone);
    }
  }

  bindGPT(gptpage: GPTPageHandler): void {
    this.gptpage = gptpage;
    this.gptpage.vote(this);
    console.log("bind pdf processor");
  }
  onSwitchPage(old: boolean): void {}

  onHooked() {}
  onUnHooked() {}

  onResponse(gptGroup: GPTGroup) {
    const that = this;
    that.process++;
    setTimeout(() => {
      that.sendNext();
    }, 2000);
  }
  onSendStart() {
    // throw new Error("Method not implemented.");
  }
  onStopGeneration() {
    // throw new Error("Method not implemented.");
    this.stoped = true;
  }

  onDropFile(file: File) {
    console.log("onDropFile");
    console.log(file);
    const that = this;
    var reader = new FileReader();

    reader.onload = function (event) {
      var arrayBuffer = event.target!.result as ArrayBuffer;
      var data = new Uint8Array(arrayBuffer!);
      var loadingTask = pdfjsLib.getDocument(data!);

      loadingTask.promise.then(
        function (pdf) {
          that.pdf = pdf;
          that.stoped = false;
          that.process = 0;
          console.log("load pdf success");
          that.sendNext();
        },
        function (reason) {
          console.error(reason);
        }
      );
    };
    reader.readAsArrayBuffer(file);
  }

  sendNext() {
    const gptPage = this.gptpage!;
    gptPage.vote(this);
    if (this.stoped) {
      console.log("if (this.stoped) {");
      return;
    }

    if (!this.pdf) {
      console.log("if (!this.pdf) {");
      return;
    }

    let page_n = this.process;
    if (page_n >= this.pdf.numPages) {
      console.log("if (page_n >= this.pdf.numPages) {");
      return;
    }

    const that = this;
    this.pdf.getPage(page_n + 1).then(function (page) {
      page.getTextContent().then(function (page_content) {
        chrome.storage.sync.get(
          {
            prompt: "Summary the content",
          },
          (items) => {
            var page_str = page_content.items
              .map((i) => (i as any).str)
              .join(" ");

            gptPage.send(items.prompt + page_str);
          }
        );
      });
    });
  }
}

export class MarkdownButton implements GPTEventListener {
  plugin_name: string = "raw_markdown";
  gptpage?: GPTPageHandler;
  bindGPT(gptpage: GPTPageHandler): void {
    this.gptpage = gptpage;
  }
  onHooked(): void {}
  onUnHooked(): void {}
  onSwitchPage(old: boolean): void {
    this.gptpage?.groups.forEach((item) => {});
  }

  makeButton(name: string) {
    const bt = document.createElement("button");
    bt.textContent = "Markdown";
    applyStyle(bt, {
      padding: "10px",
      marginRight: "10px",
      borderRadius: "4px",
      backgroundColor: "#ccc",
      color: "#000",
      border: "none",
      cursor: "pointer",
    });
    return;
  }
  makeButtonGroup(markdown_node: HTMLElement, preview_node: HTMLElement) {
    const wrap = document.createElement("div");
    applyStyle(wrap, {
      display: "flex",
      // justifyContent: "space-between",
      // alignItems: "center",
      width: "100%",
      // maxWidth: "800px",
      margin: "0 auto",
    });

    const markdownButton = makeButton("Markdown");
    const previewButton = makeButton("Preview");
    const copyButton = makeButton("Copy");

    wrap.appendChild(markdownButton);
    wrap.appendChild(previewButton);
    wrap.appendChild(copyButton);

    // 定义一个函数来处理 div1 和 div2 的可见性
    function updateVisibility(markdownActive: boolean) {
      if (markdownActive) {
        markdown_node.style.display = "block";
        preview_node.style.display = "none";
        markdownButton.style.backgroundColor = "none";
        previewButton.style.backgroundColor = "#007acc";
      } else {
        markdown_node.style.display = "none";
        preview_node.style.display = "block";
        markdownButton.style.backgroundColor = "#007acc";
        previewButton.style.backgroundColor = "none";
      }
    }

    markdownButton.addEventListener("click", () => {
      updateVisibility(true);
    });

    // 当点击 preview 按钮时，显示 div2，隐藏 div1
    previewButton.addEventListener("click", () => {
      updateVisibility(false);
    });

    copyButton.addEventListener("click", () => {
      copyTextToClipboard(markdown_node.textContent!);
    });
    return wrap;
  }

  onResponse(gptGroup: GPTGroup): void {
    console.log("onResponse");
    if (gptGroup.response!.classList.contains("remarked")) {
      return;
    }

    const preview_node = gptGroup.response!.querySelector(
      ".markdown"
    )! as HTMLElement;

    console.log(gptGroup);

    const markdown_node = document.createElement("pre");
    markdown_node.className = "raw-text";
    markdown_node.style.whiteSpace = "break-spaces";
    const code = document.createElement("p");
    markdown_node.appendChild(code);
    markdown_node.style.display = "none";
    code.textContent = divToMarkdown(preview_node);

    gptGroup.response!.classList.add("remarked");

    const wrap = this.makeButtonGroup(markdown_node, preview_node);
    preview_node.insertAdjacentElement("afterend", markdown_node);
    preview_node.insertAdjacentElement("beforebegin", wrap);
    
  }
  onStopGeneration(): void {}
  onTextareaCreate(el: HTMLTextAreaElement): void {}
  onSendStart(): void {}
}
