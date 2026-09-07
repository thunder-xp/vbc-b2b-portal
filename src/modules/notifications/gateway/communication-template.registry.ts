import type {
  CommunicationChannel,
  CommunicationIntent,
  CommunicationLocale,
  RenderedCommunication,
} from "./communication-intent";

export type CommunicationTemplateRenderer = (
  intent: CommunicationIntent,
  channel: CommunicationChannel,
) => RenderedCommunication;

function registryIdentity(
  templateKey: string,
  templateVersion: string,
  locale: CommunicationLocale,
  channel: CommunicationChannel,
): string {
  return [templateKey, templateVersion, locale, channel].join("|");
}

export class CommunicationTemplateRegistry {
  private readonly renderers = new Map<string, CommunicationTemplateRenderer>();

  register(input: {
    templateKey: string;
    templateVersion: string;
    locale: CommunicationLocale;
    channel: CommunicationChannel;
    render: CommunicationTemplateRenderer;
  }): this {
    const identity = registryIdentity(input.templateKey, input.templateVersion, input.locale, input.channel);
    if (this.renderers.has(identity)) throw new Error(`Communication template already registered: ${identity}`);
    this.renderers.set(identity, input.render);
    return this;
  }

  render(intent: CommunicationIntent, channel: CommunicationChannel): RenderedCommunication {
    const identity = registryIdentity(intent.templateKey, intent.templateVersion, intent.recipient.locale, channel);
    const renderer = this.renderers.get(identity);
    if (!renderer) throw new Error(`Communication template is not registered: ${identity}`);
    return renderer(intent, channel);
  }
}
