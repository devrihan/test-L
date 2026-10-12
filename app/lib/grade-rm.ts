import { apiGet, AGGREGATED_API_BASE } from '@/app/lib/api'

const inFlightRequests = new Map<string, Promise<GradeRmResponse>>()

export type GradeRmSubject = {
    subject: string
    grade: string
    exam: string
    schoolId?: number | null
    averages: {
        gradeAverage: number
        markedStudentCount: number
        studentCount: number
        passedCount: number | null
        failedCount: number | null
    }
    examWiseAverages: Array<{
        exam: string
        average: number
        markedStudentCount: number
    }>
    sectionWiseAverages: Array<{
        section: string
        average: number
        markedStudentCount: number
        passed?: number
        atRisk?: number
        totalStudents?: number
    }>
    sets: Array<{
        exam: string
        setNumber: string
    }>
}

export type GradeRmSectionExamAverage = {
    section: string
    exam: string
    average: number
    passed?: number
    totalStudents?: number
    atRisk?: number
}

export type GradeRmResponse = {
    grade: string
    exam: string
    schoolId?: number | null
    subjects: GradeRmSubject[]
    sectionExamWiseAverages?: GradeRmSectionExamAverage[]
}

/**
 * Grade RM exam key for a raw exam id: the id minus its leading
 * "<grade>_<subject>_", which is how the backend derives the exam family
 * shared by every subject of one exam (e.g. "11_Chemistry_UT_1_Retest_26-27"
 * -> "UT_1_Retest_26-27"). Exam ids may write the subject in another case or
 * with underscores for spaces ("12_Applied_Mathematics_..."), so the prefix is
 * matched case-insensitively with whitespace read as "_". An id without that
 * prefix is returned unchanged.
 */
export function gradeRmExamKey(
    rawExam: string,
    grade: string,
    subject: string,
): string {
    const prefix = `${grade}_${subject}_`
    const normalize = (value: string) =>
        value.replace(/\s/g, '_').toUpperCase()

    if (
        rawExam.length > prefix.length &&
        normalize(rawExam.slice(0, prefix.length)) === normalize(prefix)
    ) {
        return rawExam.slice(prefix.length)
    }

    return rawExam
}

export async function fetchGradeRm(params: {
    grade: string
    exam: string
}): Promise<GradeRmResponse> {
    const key = JSON.stringify(params)

    const existingRequest = inFlightRequests.get(key)
    if (existingRequest) {
        return existingRequest
    }

    const request = apiGet<GradeRmResponse>(
        AGGREGATED_API_BASE,
        '/api/rm/grade',
        params,
    )

    inFlightRequests.set(key, request)

    void request.then(
        () => {
            if (inFlightRequests.get(key) === request) {
                inFlightRequests.delete(key)
            }
        },
        () => {
            if (inFlightRequests.get(key) === request) {
                inFlightRequests.delete(key)
            }
        },
    )

    return request
}
