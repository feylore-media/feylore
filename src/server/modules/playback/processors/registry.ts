import type { MediaDomainProcessor } from "../domain-processor.js";

const processors = new Map<string, MediaDomainProcessor>();

export function registerMediaProcessor(processor: MediaDomainProcessor) {
  processors.set(processor.domain, processor);
}

export function getMediaProcessor(domain: string): MediaDomainProcessor | null {
  return processors.get(domain) ?? null;
}

export function listMediaProcessors(): MediaDomainProcessor[] {
  return [...processors.values()];
}

export function clearMediaProcessors() {
  processors.clear();
}

export function resolveMediaProcessor(input: {
  domain?: string;
  representationDomainModule?: string;
}): MediaDomainProcessor | null {
  if (input.domain) {
    const direct = getMediaProcessor(input.domain);
    if (direct?.canProcess(input)) return direct;
  }
  for (const processor of processors.values()) {
    if (processor.canProcess(input)) return processor;
  }
  return null;
}
