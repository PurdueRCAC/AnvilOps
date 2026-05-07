import type { DomainRepo } from "../db/repo/domain.ts";
import { logger } from "../logger.ts";
import type { CertGenerationService } from "./certGeneration.ts";
import { ValidationError } from "./errors/index.ts";

/**
 * The amount of time that the user needs to wait to retry generating a certificate if it's stuck in the Pending or Generating phase.
 * If the domain is in the Error state, it can be retried instantly.
 */
const DOMAIN_RETRY_COOLDOWN = 1000 * 60 * 5; // 5 minutes

export class RetryCertGenService {
  private certGenService: CertGenerationService;
  private domainRepo: DomainRepo;
  constructor(certGenService: CertGenerationService, domainRepo: DomainRepo) {
    this.certGenService = certGenService;
    this.domainRepo = domainRepo;
  }

  async retryCertGen(userId: number, domainId: number) {
    const domain = await this.domainRepo.getById(domainId, {
      requireUser: { id: userId },
    });

    const isStuckGenerating =
      (domain.status === "PENDING" || domain.status === "GENERATING") &&
      new Date().getTime() - domain.updatedAt.getTime() >=
        DOMAIN_RETRY_COOLDOWN;

    if (domain.status !== "ERROR" && !isStuckGenerating) {
      throw new ValidationError(
        "Can't retry unless a domain is errored or pending for at least 5 minutes.",
      );
    }

    await this.domainRepo.setStatus(domain.id, "PENDING");
    try {
      await this.certGenService.generateCert(domain.id);
    } catch (e) {
      logger.error(e, "Failed to request certificate");
      await this.domainRepo.setStatus(domain.id, "ERROR");
    }
  }
}
