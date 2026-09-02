import { In, type DataSource } from 'typeorm';
import { User } from '../../src/database/entities/user.entity';
import { ClubMember } from '../../src/database/entities/club-member.entity';
import { ClubCardRequest } from '../../src/database/entities/club-card-request.entity';
import { ClubPointsEntry } from '../../src/database/entities/club-points-entry.entity';
import { SavedPassenger } from '../../src/database/entities/saved-passenger.entity';
import { SavedBankAccount } from '../../src/database/entities/saved-bank-account.entity';
import { SavedFlight } from '../../src/database/entities/saved-flight.entity';
import { CustomerIdentityVerification } from '../../src/database/entities/customer-identity-verification.entity';
import { StoredFile } from '../../src/database/entities/stored-file.entity';
import { normalizeIranPhone } from '../../src/common/normalize-iran-phone';

/** Removes user-scoped rows left over from prior e2e runs so suites that
 * reuse fixed OTP phones stay deterministic on a non-truncated test DB.
 * The real OTP login flow (auth.service.ts) normalizes phones to E.164
 * before storing them, so the lookup must normalize too — matching on
 * the raw local-form strings never found the rows, silently no-opping. */
export async function resetCustomerPhones(
  dataSource: DataSource,
  phones: string[],
) {
  const normalized = phones.map(normalizeIranPhone);
  const userRepo = dataSource.getRepository(User);
  const users = await userRepo.find({
    where: { phone: In(normalized) },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;

  const clubMemberRepo = dataSource.getRepository(ClubMember);
  const linkedMembers = await clubMemberRepo.find({
    where: { userId: In(userIds) },
    select: { id: true },
  });
  const memberIds = linkedMembers.map((m) => m.id);
  if (memberIds.length > 0) {
    await dataSource
      .getRepository(ClubCardRequest)
      .delete({ memberId: In(memberIds) });
    await dataSource
      .getRepository(ClubPointsEntry)
      .delete({ clubMemberId: In(memberIds) });
    await clubMemberRepo.update(
      { id: In(memberIds) },
      { userId: null, cardStatus: 'NONE', cardNo: null, points: 0 },
    );
  }

  await dataSource
    .getRepository(SavedPassenger)
    .delete({ userId: In(userIds) });
  await dataSource
    .getRepository(SavedBankAccount)
    .delete({ userId: In(userIds) });
  await dataSource.getRepository(SavedFlight).delete({ userId: In(userIds) });

  const identityRepo = dataSource.getRepository(CustomerIdentityVerification);
  const identityRows = await identityRepo.find({
    where: { userId: In(userIds) },
    select: { idCardFileId: true },
  });
  const fileIds = identityRows
    .map((r) => r.idCardFileId)
    .filter((id): id is string => Boolean(id));
  await identityRepo.delete({ userId: In(userIds) });
  if (fileIds.length > 0) {
    await dataSource.getRepository(StoredFile).delete({ id: In(fileIds) });
  }

  await userRepo.update(
    { id: In(userIds) },
    {
      fullName: '',
      nationalIdEnc: null,
      nationalIdHash: null,
      birthDate: null,
    },
  );
}
