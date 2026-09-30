// Public, fixed English templates. No customer records live in this module.
export const momentCatalog = {
  moving: { label: "I am moving", group: "Home", steps: ["Update the address you use for services.", "Review your home insurance information.", "Plan the practical details of moving day."], sensitive: false },
  home_purchase: { label: "We are buying a home", group: "Home", steps: ["List the questions you want to ask about your new home.", "Review the information you have about home insurance.", "Discuss the timeline together."], sensitive: false },
  living_together: { label: "We are moving in together", group: "Family and relationships", steps: ["Discuss everyday household arrangements.", "Review which information you want to share.", "Make a list of questions for a conversation together."], sensitive: false },
  expecting_child: { label: "We are expecting a child", group: "Family and relationships", steps: ["Discuss the practical changes at home.", "Review your household information.", "Write down questions for a future conversation."], sensitive: false },
  pet: { label: "A pet is joining our home", group: "Family and relationships", steps: ["Discuss who will take care of the pet.", "Check the household arrangements.", "Review relevant insurance information."], sensitive: false },
  separation: { label: "We are separating", group: "Family and relationships", steps: ["Review what you currently share in your Circle.", "List shared household arrangements to discuss.", "Choose a trusted person to speak with if helpful."], sensitive: true },
  bereavement: { label: "Someone has died", group: "Family and relationships", steps: ["Take the time you need.", "Gather practical questions in one place.", "Choose someone you trust to help with next steps."], sensitive: true },
  new_job: { label: "I have a new job", group: "Work and study", steps: ["Review the information your new employer needs.", "Think through changes to your daily routine.", "Write down any questions about your benefits."], sensitive: false },
  self_employed: { label: "I am becoming self-employed", group: "Work and study", steps: ["List practical questions about your new work.", "Review the information you keep for your business.", "Arrange a conversation with a qualified adviser if needed."], sensitive: false },
  job_loss: { label: "I have lost my job", group: "Work and study", steps: ["Take stock of immediate practical needs.", "Review the information you have about support.", "Ask for a conversation if that would help."], sensitive: true },
  car: { label: "I am getting a car", group: "Car and mobility", steps: ["Review your transport needs.", "Check the insurance information you have.", "Plan any practical registration steps."], sensitive: false },
  parent_moves_in: { label: "I am moving in with my son.", group: "Health and care", steps: ["Review your home insurance information together.", "Discuss household arrangements and everyday responsibilities.", "Choose which information to share, and with whom."], sensitive: false },
  parent_joins: { label: "My parent is moving in with us", group: "Health and care", steps: ["Discuss living arrangements with your parent.", "Review your home insurance information together.", "Ask your parent what they want to share."], sensitive: false },
  illness: { label: "I am living with a long-term illness", group: "Health and care", steps: ["Choose a trusted person to talk to.", "Review the support information available to you.", "Plan any practical household changes."], sensitive: true },
  retirement: { label: "I am retiring", group: "Retirement and later life", steps: ["Discuss how your routine may change.", "Review your own retirement information.", "Write down questions for a qualified adviser."], sensitive: false },
  giving: { label: "I want to give something to family", group: "Retirement and later life", steps: ["Talk to family about their wishes.", "List any practical questions.", "Seek qualified advice before making decisions."], sensitive: false },
} as const;

export type MomentType = keyof typeof momentCatalog;
export const momentTypes = Object.keys(momentCatalog) as MomentType[];
export function isMomentType(value: unknown): value is MomentType {
  return typeof value === "string" && Object.hasOwn(momentCatalog, value);
}
